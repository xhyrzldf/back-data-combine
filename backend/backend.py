import os
import sys
import json
import sqlite3
import pandas as pd
import numpy as np
from flask import Flask, request, jsonify
from flask_cors import CORS
import jieba
import difflib
import re
from datetime import datetime
import time
from io import StringIO
import traceback
from simple_date_utils import parse_date
import hashlib
import subprocess
import platform
import socket

# 增加Flask请求大小限制
app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 100 * 1024 * 1024  # 设置为100MB
CORS(app)

# 验证模块 - 新增
#---------------------------------
def get_hardware_id():
    """从环境变量获取硬件ID"""
    return os.environ.get('HARDWARE_ID')

def get_expiration_date():
    """从环境变量获取过期日期"""
    expiration_str = os.environ.get('EXPIRATION_DATE')
    if expiration_str:
        try:
            # 移除时区信息
            dt = datetime.fromisoformat(expiration_str.replace('Z', '+00:00'))
            return datetime(dt.year, dt.month, dt.day)  # 返回不带时区的日期
        except ValueError:
            print(f"无效的过期日期格式: {expiration_str}", file=sys.stderr)
    
    # 如果未设置或格式错误，使用默认日期
    return datetime(2025, 7, 1)

def check_expiration():
    """检查应用是否过期"""
    # 检查是否为开发模式
    dev_mode = os.environ.get('DEV_MODE', 'false').lower() == 'true'
    
    # 在开发模式下返回未过期
    if dev_mode:
        print("开发模式：跳过过期检查", file=sys.stderr)
        return False
    current_date = datetime.now()
    expiration_date = get_expiration_date()
    
    # 检查系统时间是否被回调（与上次运行时间比较）
    last_run_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), '.last_run')
    
    if os.path.exists(last_run_file):
        try:
            with open(last_run_file, 'r') as f:
                last_run_str = f.read().strip()
                last_run_date = datetime.fromisoformat(last_run_str)
                
                # 如果当前时间比上次运行时间早一天以上，可能是时间被回调
                if current_date < last_run_date and (last_run_date - current_date).days > 1:
                    print("检测到可能的时间篡改", file=sys.stderr)
                    return True
        except Exception as e:
            print(f"读取上次运行时间出错: {e}", file=sys.stderr)
    
    # 保存当前运行时间
    try:
        with open(last_run_file, 'w') as f:
            f.write(current_date.isoformat())
    except Exception as e:
        print(f"保存当前运行时间出错: {e}", file=sys.stderr)
    
    # 检查是否超过过期日期
    return current_date >= expiration_date

def get_local_hardware_fingerprint():
    """获取本地硬件指纹（作为备份验证）"""
    try:
        fingerprint_components = []
        
        # 获取主板序列号 (Windows)
        if platform.system() == "Windows":
            try:
                result = subprocess.run(["wmic", "baseboard", "get", "serialnumber"], 
                                        capture_output=True, text=True, check=True)
                lines = result.stdout.strip().split('\n')
                if len(lines) >= 2:
                    fingerprint_components.append(lines[1].strip())
            except Exception as e:
                print(f"获取主板序列号失败: {e}", file=sys.stderr)
        
        # 获取主板信息 (通用)
        try:
            if platform.system() == "Windows":
                result = subprocess.run(["wmic", "baseboard", "get", "manufacturer,product"], 
                                    capture_output=True, text=True, check=True)
                fingerprint_components.append(result.stdout.strip())
            elif platform.system() == "Linux":
                result = subprocess.run(["dmidecode", "-t", "2"], 
                                    capture_output=True, text=True, check=True)
                fingerprint_components.append(result.stdout.strip())
        except Exception as e:
            print(f"获取主板信息失败: {e}", file=sys.stderr)
        
        # 获取CPU信息
        try:
            if platform.system() == "Windows":
                result = subprocess.run(["wmic", "cpu", "get", "processorid"], 
                                    capture_output=True, text=True, check=True)
                lines = result.stdout.strip().split('\n')
                if len(lines) >= 2:
                    fingerprint_components.append(lines[1].strip())
            elif platform.system() == "Linux":
                with open('/proc/cpuinfo', 'r') as f:
                    for line in f:
                        if line.startswith('processor'):
                            fingerprint_components.append(line.strip())
                            break
        except Exception as e:
            print(f"获取CPU信息失败: {e}", file=sys.stderr)
        
        # 如果没有收集到足够的硬件信息，使用计算机名称和用户名
        if len(fingerprint_components) < 2:
            fingerprint_components.append(platform.node())
            fingerprint_components.append(os.getlogin())
        
        # 计算哈希
        fingerprint_str = '|'.join(fingerprint_components)
        return hashlib.sha256(fingerprint_str.encode()).hexdigest()
    
    except Exception as e:
        print(f"获取硬件指纹失败: {e}", file=sys.stderr)
        return None

def verify_hardware():
    """验证当前硬件是否匹配"""
    # 检查是否为开发模式
    dev_mode = os.environ.get('DEV_MODE', 'false').lower() == 'true'
    
    # 在开发模式下返回验证通过
    if dev_mode:
        print("开发模式：跳过硬件验证", file=sys.stderr)
        return True
    # 从环境变量获取硬件ID
    env_hardware_id = get_hardware_id()
    
    # 如果没有提供环境变量中的硬件ID，则跳过验证
    if not env_hardware_id:
        print("警告: 未提供硬件ID，跳过验证", file=sys.stderr)
        return True
    
    # 获取当前硬件指纹
    local_hardware_id = get_local_hardware_fingerprint()
    
    # 如果无法获取本地硬件ID，则使用一个简单的替代方案
    if not local_hardware_id:
        simple_id = hashlib.md5((platform.node() + platform.machine()).encode()).hexdigest()
        return env_hardware_id == simple_id
    
    # 主要验证: 环境变量中的ID与本地计算的ID是否匹配
    # 允许部分匹配以增加灵活性（对于一些特殊情况，允许首部16个字符匹配）
    return env_hardware_id == local_hardware_id or env_hardware_id[:16] == local_hardware_id[:16]

# 为所有接口添加验证层 - 新增
def verify_request():
    """验证请求，检查应用是否过期或硬件是否不匹配"""
    if check_expiration():
        return {'status': 'error', 'message': '应用授权已过期'}, 403
    
    if not verify_hardware():
        return {'status': 'error', 'message': '硬件验证失败'}, 403
    
    return None
#---------------------------------

# 配置更详细的日志
@app.errorhandler(Exception)
def handle_exception(e):
    """全局异常处理器，记录详细错误"""
    print(f"ERROR: {str(e)}", file=sys.stderr)
    print(f"TRACEBACK: {traceback.format_exc()}", file=sys.stderr)
    return jsonify({"status": "error", "message": str(e), "traceback": traceback.format_exc()}), 500

# Global variables
templates = {}
default_template = {}
synonym_mappings = {}
recent_files = []
MAX_RECENT_FILES = 20

# Initialize with default template
default_template = {
    "ID": {"type": "int", "synonyms": ["序号", "ID", "id", "编号"]},
    "记账日期": {"type": "date", "synonyms": ["交易日期", "会计日期", "日期", "date", "交易日", "前台交易日期"]},
    "记账时间": {"type": "time", "synonyms": ["交易时间", "时间", "time", "前台交易时间"]},
    "账户名": {"type": "text", "synonyms": ["户名", "客户名称", "客户账户名", "账户中文名"]},
    "账号": {"type": "text", "synonyms": ["客户账号", "账户", "account", "账户账号"]},
    "开户行": {"type": "text", "synonyms": ["开户银行", "开户机构", "账户开户机构", "机构中文名称"]},
    "币种": {"type": "text", "synonyms": ["货币代号", "币种代码", "currency", "钞汇标志"]},
    "借贷": {"type": "text", "synonyms": ["借贷标志", "借贷方向", "借贷标记", "dr_cr"]},
    "交易金额": {"type": "float", "synonyms": ["金额", "发生额", "交易额", "amount"]},
    "交易渠道": {"type": "text", "synonyms": ["渠道", "交易方式", "渠道类型编号"]},
    "网点名称": {"type": "text", "synonyms": ["网点", "营业网点", "营业机构", "机构名称"]},
    "附言": {"type": "text", "synonyms": ["摘要", "备注", "摘要描述", "摘要代码描述"]},
    "余额": {"type": "float", "synonyms": ["账户余额", "balance", "当前余额"]},
    "对手账户名": {"type": "text", "synonyms": ["对方户名", "交易对方账户名", "对方账户名称"]},
    "对手账号": {"type": "text", "synonyms": ["对方账号", "交易对方账号", "对方账户账号"]},
    "对手开户行": {"type": "text", "synonyms": ["对方行名", "对方机构网点名称", "对方开户银行"]}
}

templates["默认模板"] = default_template.copy()

def create_database(db_path):
    """Create a new SQLite database with the standard schema"""
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    # Create main table with standard columns - 修改ID和row_number为TEXT类型
    columns = [
        "ID TEXT PRIMARY KEY",  # 改为TEXT类型
        "记账日期 TEXT",
        "记账时间 TEXT",
        "账户名 TEXT",
        "账号 TEXT",
        "开户行 TEXT",
        "币种 TEXT",
        "借贷 TEXT",
        "交易金额 REAL",
        "交易渠道 TEXT",
        "网点名称 TEXT",
        "附言 TEXT",
        "余额 REAL",
        "对手账户名 TEXT",
        "对手账号 TEXT",
        "对手开户行 TEXT",
        "source_file TEXT",
        "row_number TEXT"  # 改为TEXT类型
    ]
    
    cursor.execute(f"CREATE TABLE IF NOT EXISTS transactions ({', '.join(columns)})")
    
    # 创建带新列的rejected_rows表，确保row_number为TEXT类型
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS rejected_rows (
        id INTEGER PRIMARY KEY,
        source_file TEXT,
        row_number TEXT,
        column_name TEXT,
        target_column TEXT,
        original_value TEXT,
        raw_data TEXT,
        reason TEXT
    )
    """)
    
    conn.commit()
    conn.close()


def update_recent_files(file_path):
    """Update the list of recent files"""
    global recent_files
    if file_path in recent_files:
        recent_files.remove(file_path)
    recent_files.insert(0, file_path)
    if len(recent_files) > MAX_RECENT_FILES:
        recent_files = recent_files[:MAX_RECENT_FILES]


def get_column_similarity(col_name, template_columns):
    """Calculate similarity between column name and template column names"""
    scores = {}
    for template_col, details in template_columns.items():
        synonyms = details["synonyms"]

        # Check for exact match
        if col_name in synonyms or col_name == template_col:
            return template_col, 1.0

        # Calculate string similarity
        best_score = 0
        for synonym in synonyms + [template_col]:
            # Use difflib for string similarity
            score = difflib.SequenceMatcher(None, col_name, synonym).ratio()
            best_score = max(best_score, score)

        scores[template_col] = best_score

    # Find the best match
    best_match = max(scores.items(), key=lambda x: x[1])
    return best_match[0], best_match[1]


def detect_column_type(series):
    """Detect the data type of a column"""
    # Check if all values can be converted to numbers
    try:
        pd.to_numeric(series.dropna())
        # If small range of integers, likely an ID column
        if series.nunique() == len(series) and series.min() >= 0 and series.max() < 10000:
            return "int"
        return "float"
    except:
        pass

    # Check if all values are date-like
    date_pattern = re.compile(r'^\d{4}[-/]\d{1,2}[-/]\d{1,2}$|^\d{2}[-/]\d{1,2}[-/]\d{4}$|^\d{8}$')
    if series.dropna().apply(lambda x: bool(date_pattern.match(str(x)))).all():
        return "date"

    # Check if all values are time-like
    time_pattern = re.compile(r'^\d{1,2}:\d{2}(:\d{2})?$')
    if series.dropna().apply(lambda x: bool(time_pattern.match(str(x)))).all():
        return "time"

    # Otherwise, it's text
    return "text"

def convert_value(value, target_type):
    """
    转换一个值到目标数据类型，使用Babel库处理金融数字格式
    
    Args:
        value: 要转换的原始值
        target_type: 目标数据类型 ("int", "float", "date", "time", "text")
        
    Returns:
        转换后的值，如果转换失败则抛出异常
    """
    from babel.numbers import parse_decimal
    import pandas as pd
    import sys
    import math
    
    # 处理空值
    if pd.isna(value):
        return None

    # 将值转为字符串并去除首尾空格
    value = str(value).strip()
    if not value:
        return None
    
    try:
        if target_type == "int":
            # 尝试转换为整数
            try:
                # 使用Babel解析数字，支持各种格式的金融数字
                # 默认使用英语区域格式 (如 "1,234.56")
                try:
                    parsed_value = parse_decimal(value, locale='en_US')
                    int_value = int(parsed_value)
                except:
                    # 如果Babel解析失败，尝试使用其他区域格式
                    try:
                        # 尝试中文区域格式
                        parsed_value = parse_decimal(value, locale='zh_CN') 
                        int_value = int(parsed_value)
                    except:
                        # 如果还是失败，尝试直接清除常见的分隔符
                        cleaned_value = value.replace(',', '').replace(' ', '')
                        int_value = int(float(cleaned_value))
                
                # 检查是否是大整数，如果是，则返回字符串
                if abs(int_value) > 9223372036854775807:  # SQLite INTEGER最大值
                    print(f"警告：整数值 {int_value} 太大，将以字符串形式存储", file=sys.stderr, flush=True)
                    return str(int_value)  # 返回不带分隔符的字符串形式
                return int_value
            except ValueError as e:
                # 如果无法转换，尝试清理可能的非数字字符后再转换
                cleaned_value = ''.join(c for c in value if c.isdigit() or c == '-' or c == '.')
                if cleaned_value:
                    try:
                        # 如果包含小数点，先转为浮点数再转为整数
                        if '.' in cleaned_value:
                            return int(float(cleaned_value))
                        return int(cleaned_value)
                    except ValueError:
                        # 如果仍然失败，抛出原始异常
                        raise ValueError(f"无法将值 '{value}' 转换为整数: {str(e)}")
                else:
                    raise ValueError(f"无法将值 '{value}' 转换为整数: 没有有效数字")
        
        elif target_type == "float":
            # 尝试使用Babel解析金融格式的浮点数
            try:
                # 首先尝试英语区域格式
                return float(parse_decimal(value, locale='en_US'))
            except:
                try:
                    # 尝试中文区域格式
                    return float(parse_decimal(value, locale='zh_CN'))
                except:
                    # 如果Babel解析失败，尝试手动清理常见分隔符
                    cleaned_value = value.replace(',', '').replace(' ', '')
                    try:
                        # 处理特殊的百分比格式
                        if cleaned_value.endswith('%'):
                            return float(cleaned_value.rstrip('%')) / 100
                        return float(cleaned_value)
                    except ValueError:
                        raise ValueError(f"无法将值 '{value}' 转换为浮点数")
        
        elif target_type == "date":
            # 处理可能带有小数点的日期值（如"20210610.0"）
            if '.' in value:
                # 尝试提取整数部分
                int_part = value.split('.')[0]
                if int_part.isdigit():
                    value = int_part  # 使用整数部分
            
            # 使用增强的日期解析功能
            from simple_date_utils import parse_date
            parsed_date = parse_date(value)
            if parsed_date:
                return parsed_date
            # 如果解析失败，抛出异常
            raise ValueError(f"无法将值 '{value}' 转换为日期格式")
        
        elif target_type == "time":
            # 使用增强的时间解析功能
            from simple_date_utils import parse_time
            parsed_time = parse_time(value)
            if parsed_time:
                return parsed_time
            # 如果解析失败，抛出异常
            raise ValueError(f"无法将值 '{value}' 转换为时间格式")
        
        else:
            # 对于文本类型，直接返回字符串
            return value
    
    except Exception as e:
        # 转换失败时抛出异常，包含原始错误信息
        if isinstance(e, ValueError) and str(e).startswith("无法将值"):
            # 已经是自定义的错误消息，直接抛出
            raise e
        else:
            # 转换为更友好的错误消息
            raise ValueError(f"无法将值 '{value}' 转换为 {target_type} 类型: {str(e)}")

# API Routes
@app.route('/api/ping', methods=['GET'])
def ping():
    """Simple ping endpoint to test if server is running"""
    # 验证请求（但不拒绝ping）
    validation = verify_request()
    if validation:
        # 对ping请求返回特殊的响应
        result = {'status': 'warning'}
        if '过期' in validation[0]['message']:
            result['message'] = '应用已过期'
        elif '硬件' in validation[0]['message']:
            result['message'] = '硬件验证失败'
        return jsonify(result)
        
    return jsonify({"status": "success", "message": "Backend is running"})


@app.route('/api/templates', methods=['GET'])
def get_templates():
    """Get all templates"""
    # 验证请求
    validation = verify_request()
    if validation:
        return jsonify(validation[0]), validation[1]
        
    return jsonify({
        "status": "success",
        "templates": templates,
        "default_template": list(templates.keys())[0] if templates else None
    })


@app.route('/api/templates', methods=['POST'])
def save_template():
    """Save a new template or update existing one"""
    # 验证请求
    validation = verify_request()
    if validation:
        return jsonify(validation[0]), validation[1]
        
    data = request.json
    template_name = data.get('name')
    template_data = data.get('template')
    is_default = data.get('is_default', False)

    if not template_name or not template_data:
        return jsonify({"status": "error", "message": "Missing template name or data"}), 400

    templates[template_name] = template_data

    if is_default:
        global default_template
        default_template = template_data.copy()

    return jsonify({"status": "success", "message": f"Template '{template_name}' saved"})


@app.route('/api/templates/<name>', methods=['DELETE'])
def delete_template(name):
    """Delete a template"""
    # 验证请求
    validation = verify_request()
    if validation:
        return jsonify(validation[0]), validation[1]
        
    if name in templates:
        del templates[name]
        return jsonify({"status": "success", "message": f"Template '{name}' deleted"})
    return jsonify({"status": "error", "message": f"Template '{name}' not found"}), 404


@app.route('/api/recent-files', methods=['GET'])
def get_recent_files():
    """Get list of recent files"""
    # 验证请求
    validation = verify_request()
    if validation:
        return jsonify(validation[0]), validation[1]
        
    return jsonify({
        "status": "success",
        "recent_files": recent_files
    })


@app.route('/api/analyze-file', methods=['POST'])
def analyze_file():
    """Analyze a single Excel file and detect columns"""
    # 验证请求
    validation = verify_request()
    if validation:
        return jsonify(validation[0]), validation[1]
        
    data = request.json
    file_path = data.get('file_path')
    template_name = data.get('template_name', None)

    if not file_path:
        return jsonify({"status": "error", "message": "Missing file path"}), 400

    try:
        # Read Excel file
        df = pd.read_excel(file_path, nrows=100)  # Read only first 100 rows for analysis

        # Get column information
        columns = []
        for col in df.columns:
            col_name = str(col).strip()
            col_type = detect_column_type(df[col])

            # Map to template column if template is provided
            template_column = None
            similarity = 0
            if template_name and template_name in templates:
                template = templates[template_name]
                template_column, similarity = get_column_similarity(col_name, template)

            columns.append({
                "original_name": col_name,
                "detected_type": col_type,
                "mapped_to": template_column if similarity > 0.6 else None,
                "similarity": similarity,
                "sample_values": df[col].dropna().head(5).tolist()
            })

        return jsonify({
            "status": "success",
            "file_name": os.path.basename(file_path),
            "total_rows": len(df),
            "columns": columns
        })
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route('/api/process-files', methods=['POST'])
def process_files():
    """Process multiple Excel files and merge them into a database"""
    # 验证请求
    validation = verify_request()
    if validation:
        return jsonify(validation[0]), validation[1]
        
    data = request.json
    file_paths = data.get('file_paths', [])
    db_path = data.get('db_path')
    column_mappings = data.get('column_mappings', {})

    if not file_paths or not db_path:
        return jsonify({"status": "error", "message": "Missing file paths or database path"}), 400

    try:
        # Create database
        create_database(db_path)
        conn = sqlite3.connect(db_path, timeout=60)  # 增加连接超时时间
        cursor = conn.cursor()

        total_processed = 0
        total_rejected = 0
        file_stats = []

        for file_idx, file_path in enumerate(file_paths):
            try:
                # 检查文件是否存在
                if not os.path.exists(file_path):
                    file_stats.append({
                        "file_name": os.path.basename(file_path),
                        "error": "文件不存在"
                    })
                    continue
                
                # 检查文件大小
                file_size = os.path.getsize(file_path)
                print(f"处理文件: {os.path.basename(file_path)}, 大小: {file_size/(1024*1024):.2f} MB", 
                      file=sys.stderr, flush=True)
                
                # 尝试读取Excel文件
                try:
                    # 大文件分块处理
                    if file_size > 50 * 1024 * 1024:  # 50MB
                        print(f"大文件处理模式: {os.path.basename(file_path)}", file=sys.stderr, flush=True)
                        
                        try:
                            # 分块读取大文件
                            chunk_size = 5000  # 每次读取5000行
                            xls = pd.ExcelFile(file_path)
                            sheet_name = xls.sheet_names[0]  # 假设处理第一个sheet
                            
                            # 先读取一行获取列名
                            header_df = pd.read_excel(file_path, sheet_name=sheet_name, nrows=1)
                            columns = header_df.columns.tolist()
                            
                            # 估算总行数
                            approx_total_rows = max(int(file_size / 2000), 1000)  # 粗略估计
                            chunks_processed = 0
                            all_mapped_data = []
                            all_rejected_rows = []
                            
                            # 逐块读取处理
                            skip_rows = 1  # 跳过标题行
                            total_rejected = 0  # 追踪被拒绝的行总数
                            
                            while True:
                                try:
                                    chunk_df = pd.read_excel(
                                        file_path, 
                                        sheet_name=sheet_name,
                                        skiprows=range(1, skip_rows) if skip_rows > 1 else None,
                                        nrows=chunk_size,
                                        names=columns if skip_rows > 1 else None
                                    )
                                    
                                    # 如果没有数据了，跳出循环
                                    if chunk_df.empty:
                                        break
                                        
                                    chunk_results = process_dataframe_chunk(
                                        chunk_df, file_path, skip_rows-1, column_mappings
                                    )
                                    
                                    # 确保结果包含正确的键
                                    if "mapped_data" not in chunk_results or "rejected_rows" not in chunk_results:
                                        print(f"警告: process_dataframe_chunk返回格式不正确", file=sys.stderr, flush=True)
                                        if isinstance(chunk_results, dict):
                                            print(f"结果包含的键: {list(chunk_results.keys())}", file=sys.stderr, flush=True)
                                        else:
                                            print(f"结果类型: {type(chunk_results)}", file=sys.stderr, flush=True)
                                        continue
                                    
                                    current_mapped = chunk_results.get("mapped_data", [])
                                    current_rejected = chunk_results.get("rejected_rows", [])
                                    
                                    # 打印当前块的结果统计
                                    print(f"块 {chunks_processed+1}: 映射行数={len(current_mapped)}, 拒绝行数={len(current_rejected)}", 
                                        file=sys.stderr, flush=True)
                                    
                                    all_mapped_data.extend(current_mapped)
                                    all_rejected_rows.extend(current_rejected)
                                    total_rejected += len(current_rejected)
                                    
                                    # 每处理5个块提交一次事务
                                    chunks_processed += 1
                                    if chunks_processed % 5 == 0:
                                        # 插入已处理的数据
                                        if all_mapped_data or all_rejected_rows:
                                            print(f"提交数据块: 映射行={len(all_mapped_data)}, 拒绝行={len(all_rejected_rows)}", 
                                                file=sys.stderr, flush=True)
                                            insert_data_to_db(conn, cursor, all_mapped_data, all_rejected_rows)
                                            conn.commit()
                                        
                                        # 清空临时列表以释放内存
                                        all_mapped_data = []
                                        all_rejected_rows = []
                                        
                                        # 报告进度
                                        rows_processed = skip_rows + len(chunk_df) - 1
                                        print(f"已处理: {rows_processed} 行 ({chunks_processed} 块)", 
                                            file=sys.stderr, flush=True)
                                    
                                    # 更新下一块的起始行
                                    skip_rows += len(chunk_df)
                                    
                                except Exception as chunk_error:
                                    print(f"处理数据块错误: {str(chunk_error)}", file=sys.stderr, flush=True)
                                    traceback.print_exc(file=sys.stderr)
                                    # 尝试继续处理下一块
                                    skip_rows += chunk_size
                                    if skip_rows > approx_total_rows * 2:  # 防止无限循环
                                        break
                            
                            # 处理剩余数据
                            if all_mapped_data or all_rejected_rows:
                                print(f"提交最终数据块: 映射行={len(all_mapped_data)}, 拒绝行={len(all_rejected_rows)}", 
                                    file=sys.stderr, flush=True)
                                insert_data_to_db(conn, cursor, all_mapped_data, all_rejected_rows)
                                conn.commit()
                            
                            # 构建文件处理统计
                            total_rows = skip_rows - 1
                            processed_rows = total_rows - total_rejected
                            rejected_rows = total_rejected
                            
                            print(f"大文件处理完成. 总行数: {total_rows}, 处理行数: {processed_rows}, 拒绝行数: {rejected_rows}", 
                                file=sys.stderr, flush=True)
                        except Exception as big_file_error:
                            print(f"大文件处理失败: {str(big_file_error)}", file=sys.stderr, flush=True)
                            traceback.print_exc(file=sys.stderr)
                            raise big_file_error
                    else:
                        # 小文件直接处理
                        df = pd.read_excel(file_path)
                        
                        # 使用标准处理逻辑
                        results = process_dataframe_chunk(df, file_path, 0, column_mappings)
                        mapped_data = results["mapped_data"]
                        rejected_rows = results["rejected_rows"]
                        
                        # 插入数据
                        insert_data_to_db(conn, cursor, mapped_data, rejected_rows)
                        
                        # 记录统计信息
                        total_rows = len(df)
                        processed_rows = len(mapped_data)
                        rejected_rows = len(rejected_rows)
                        
                    # 更新统计信息
                    total_processed += processed_rows
                    total_rejected += rejected_rows
                    
                    file_stats.append({
                        "file_name": os.path.basename(file_path),
                        "total_rows": total_rows,
                        "processed_rows": processed_rows,
                        "rejected_rows": rejected_rows
                    })
                
                except pd.errors.ParserError as excel_error:
                    error_msg = f"Excel解析错误: {str(excel_error)}"
                    print(error_msg, file=sys.stderr, flush=True)
                    file_stats.append({
                        "file_name": os.path.basename(file_path),
                        "error": error_msg
                    })
                    continue
                except Exception as excel_error:
                    error_msg = f"读取Excel文件失败: {str(excel_error)}"
                    print(error_msg, file=sys.stderr, flush=True)
                    traceback.print_exc(file=sys.stderr)
                    file_stats.append({
                        "file_name": os.path.basename(file_path),
                        "error": error_msg
                    })
                    continue

                # 提交当前文件的所有更改
                conn.commit()

                # 更新处理进度
                progress = (file_idx + 1) / len(file_paths) * 100
                print(f"Progress: {progress:.2f}%", file=sys.stderr, flush=True)

            except Exception as file_error:
                error_msg = f"处理文件错误: {str(file_error)}"
                print(error_msg, file=sys.stderr, flush=True)
                traceback.print_exc(file=sys.stderr)
                file_stats.append({
                    "file_name": os.path.basename(file_path),
                    "error": error_msg
                })

        # 最终提交并关闭连接
        conn.commit()
        conn.close()

        # 更新最近文件列表
        update_recent_files(db_path)

        return jsonify({
            "status": "success",
            "db_path": db_path,
            "total_processed": total_processed,
            "total_rejected": total_rejected,
            "file_stats": file_stats
        })
    except Exception as e:
        print(f"处理文件过程中发生严重错误: {str(e)}", file=sys.stderr, flush=True)
        traceback.print_exc(file=sys.stderr)
        
        # 确保关闭数据库连接
        try:
            if 'conn' in locals() and conn:
                conn.close()
        except:
            pass
            
        return jsonify({
            "status": "error", 
            "message": str(e),
            "details": traceback.format_exc()
        }), 500

def process_dataframe_chunk(df, file_path, start_row, column_mappings):
    """处理数据框的一个块，返回映射数据和被拒绝的行"""
    mapped_data = []
    rejected_rows = []
    
    # 获取此文件的列映射
    file_name = os.path.basename(file_path)
    file_mapping = column_mappings.get(file_path, {})
    if not file_mapping and file_name in column_mappings:
        file_mapping = column_mappings[file_name]
    
    # 如果还没有映射，尝试通过文件名查找
    if not file_mapping:
        for path in column_mappings:
            if path.endswith(file_name):
                file_mapping = column_mappings[path]
                break
    
    # 调试输出当前的映射情况
    print(f"文件 {file_name} 的列映射: {file_mapping}", file=sys.stderr, flush=True)
    
    # 处理每一行
    for idx, row in df.iterrows():
        try:
            # ========= 修复行号处理 =========
            # 计算正确的行号（纯数字）
            row_number = start_row + idx + 1
            
            # 确保row_number是字符串，且不是日期格式
            row_number_str = str(row_number)
            
            # 检查是否有"行号"或类似列，如果有直接用它作为row_number的值
            row_num_candidates = ['row_number', 'rownum', 'row', '行号', '行']
            for col in row_num_candidates:
                if col in df.columns and pd.notna(row[col]):
                    # 确保值是整数或字符串
                    candidate_value = row[col]
                    if isinstance(candidate_value, (int, float)) or (isinstance(candidate_value, str) and candidate_value.isdigit()):
                        row_number_str = str(int(float(candidate_value)))
                        print(f"使用列 '{col}' 的值作为行号: {row_number_str}", file=sys.stderr, flush=True)
                        break
            # ======== 行号处理结束 =========
            
            mapped_row = {
                "ID": None,
                "记账日期": None,
                "记账时间": None,
                "账户名": None,
                "账号": None,
                "开户行": None,
                "币种": None,
                "借贷": None,
                "交易金额": None,
                "交易渠道": None,
                "网点名称": None,
                "附言": None,
                "余额": None,
                "对手账户名": None,
                "对手账号": None,
                "对手开户行": None,
                "source_file": file_name,
                "row_number": row_number_str  # 使用处理后的行号字符串
            }
    
            has_data = False
            row_has_errors = False  # 标记该行是否有转换错误
            
            for orig_col, target_col in file_mapping.items():
                if orig_col in df.columns and target_col:
                    try:
                        value = row[orig_col]
                        # 记录原始值，方便出错时记录
                        original_value = str(value) if pd.notna(value) else None
                        
                        if pd.notna(value) and str(value).strip():
                            has_data = True
    
                        # 获取目标类型
                        target_type = "text"  # 默认
                        for template in templates.values():
                            if target_col in template:
                                target_type = template[target_col]["type"]
                                break
                                
                        # 如果是ID字段，确保以字符串形式存储
                        if target_col == "ID" and pd.notna(value):
                            mapped_row[target_col] = str(value)
                            continue
    
                        # 尝试转换数据类型
                        mapped_row[target_col] = convert_value(value, target_type)
                    except Exception as conv_error:
                        # 详细记录错误信息
                        error_msg = f"转换错误 行 {row_number_str}, 列 {orig_col}: {str(conv_error)}"
                        print(error_msg, file=sys.stderr, flush=True)
                        
                        # 标记行有错误
                        row_has_errors = True
                        
                        # 创建rejected_row记录，确保包含列名和原始值
                        try:
                            # 保证有值的original_value
                            safe_original_value = original_value if original_value else "null"
                            
                            # 将每个出错的字段单独记录，确保row_number是字符串
                            rejected_rows.append({
                                "source_file": file_name,
                                "row_number": row_number_str,  # 确保行号是字符串
                                "column_name": orig_col,  # 记录原始列名
                                "target_column": target_col,  # 记录目标列名
                                "original_value": safe_original_value,  # 原始值
                                "raw_data": json.dumps(row.to_dict(), default=str),  # 整行数据
                                "reason": str(conv_error)  # 错误原因
                            })
                            
                            # 打印调试信息
                            print(f"创建rejected_row: 列={orig_col}, 目标列={target_col}, 原始值={safe_original_value}", 
                                  file=sys.stderr, flush=True)
                        except Exception as e:
                            print(f"创建rejected_row失败: {e}", file=sys.stderr, flush=True)
                        
                        # 重置目标列值
                        mapped_row[target_col] = None
    
            # 跳过空行
            if not has_data:
                continue
    
            # 如果行没有错误，添加到映射数据
            if not row_has_errors:
                mapped_data.append(mapped_row)
            
        except Exception as row_error:
            # 处理整行错误
            try:
                rejected_rows.append({
                    "source_file": file_name,
                    "row_number": str(row_number),  # 确保行号是字符串
                    "column_name": "整行错误",  # 标记为整行错误
                    "target_column": "",  # 没有特定目标列
                    "original_value": "整行处理失败",  # 简单描述
                    "raw_data": json.dumps(row.to_dict(), default=str),  # 保存原始数据
                    "reason": str(row_error)  # 错误原因
                })
                print(f"整行处理错误: 行={row_number}, 错误={str(row_error)}", file=sys.stderr, flush=True)
            except Exception as e:
                print(f"创建整行错误记录失败: {e}", file=sys.stderr, flush=True)
    
    # 打印处理结果摘要
    print(f"处理结果: {file_name} - 映射数据: {len(mapped_data)}行, 被拒绝: {len(rejected_rows)}行", 
          file=sys.stderr, flush=True)
    if rejected_rows:
        print(f"示例被拒绝行: {rejected_rows[0]}", file=sys.stderr, flush=True)
    
    return {"mapped_data": mapped_data, "rejected_rows": rejected_rows}

def insert_data_to_db(conn, cursor, mapped_data, rejected_rows):
    """将映射数据和被拒绝的行插入数据库"""
    import math  # 添加math模块导入
    
    try:
        # 插入映射数据
        if mapped_data and len(mapped_data) > 0:
            for row in mapped_data:
                # 确保ID和row_number字段是字符串类型
                if 'ID' in row and row['ID'] is not None:
                    row['ID'] = str(row['ID'])
                if 'row_number' in row and row['row_number'] is not None:
                    row['row_number'] = str(row['row_number'])
                
                # 检查其他字段，将大整数转换为字符串
                for key in row:
                    if isinstance(row[key], int) and abs(row[key]) > 9223372036854775807:
                        row[key] = str(row[key])
                        print(f"将字段 {key} 的大整数值转换为字符串: {row[key]}", file=sys.stderr, flush=True)
                
                # 构建插入查询
                columns = list(row.keys())
                values = [row[col] for col in columns]
                
                # 使用INSERT OR IGNORE语法，忽略已存在的ID
                # 这将跳过任何违反唯一约束的插入操作，而不是引发错误
                placeholders = ", ".join(["?" for _ in columns])
                insert_query = f"INSERT OR IGNORE INTO transactions ({', '.join(columns)}) VALUES ({placeholders})"
                
                try:
                    cursor.execute(insert_query, values)
                    # 如果没有插入行（因为ID已存在），可以选择记录一条警告
                    if cursor.rowcount == 0:
                        print(f"警告: ID为 {row.get('ID', '未知')} 的记录已存在，已跳过", file=sys.stderr, flush=True)
                except sqlite3.Error as sql_error:
                    print(f"SQL错误(插入映射数据): {str(sql_error)}", file=sys.stderr, flush=True)
                    print(f"问题数据类型: {[type(v) for v in values]}", file=sys.stderr, flush=True)
                    print(f"问题数据值: {values}", file=sys.stderr, flush=True)
                    
                    # 更强的安全类型转换
                    safe_values = []
                    for v in values:
                        if isinstance(v, int) and abs(v) > 9223372036854775807:
                            safe_values.append(str(v))
                        elif isinstance(v, float) and (abs(v) > 9223372036854775807 or math.isnan(v) or math.isinf(v)):
                            safe_values.append(str(v))
                        else:
                            safe_values.append(v)
                    
                    try:
                        cursor.execute(insert_query, safe_values)
                        print("使用安全类型值重试成功", file=sys.stderr, flush=True)
                    except sqlite3.Error as retry_error:
                        print(f"使用安全类型重试仍然失败: {str(retry_error)}", file=sys.stderr, flush=True)
                        
                        # 最后的尝试：将所有值转换为字符串
                        try:
                            all_string_values = [str(v) if v is not None else None for v in values]
                            cursor.execute(insert_query, all_string_values)
                            print("使用全字符串类型重试成功", file=sys.stderr, flush=True)
                        except sqlite3.Error as final_error:
                            print(f"所有尝试都失败，跳过此行: {str(final_error)}", file=sys.stderr, flush=True)
                            continue

        # 插入被拒绝的行 - 直接使用当前连接，而不是创建新连接
        if rejected_rows and len(rejected_rows) > 0:
            print(f"正在插入 {len(rejected_rows)} 条被拒绝的行...", file=sys.stderr, flush=True)
            
            # 确保表存在
            cursor.execute("""
            CREATE TABLE IF NOT EXISTS rejected_rows (
                id INTEGER PRIMARY KEY,
                source_file TEXT,
                row_number TEXT,
                column_name TEXT,
                target_column TEXT,
                original_value TEXT,
                raw_data TEXT,
                reason TEXT
            )
            """)
            conn.commit()
            
            # 执行批量插入
            for row in rejected_rows:
                # 确保row_number是字符串
                if 'row_number' in row and row['row_number'] is not None:
                    row['row_number'] = str(row['row_number'])
                
                # 确保所有必要字段都存在
                required_fields = [
                    "source_file", "row_number", "column_name", 
                    "target_column", "original_value", "raw_data", "reason"
                ]
                
                # 确保所有字段都有值，没有值的用空字符串代替
                for field in required_fields:
                    if field not in row or row[field] is None:
                        row[field] = ""
                
                # 确保raw_data是字符串
                if isinstance(row["raw_data"], (dict, list)):
                    try:
                        row["raw_data"] = json.dumps(row["raw_data"], default=str)
                    except Exception as e:
                        print(f"序列化raw_data失败: {str(e)}", file=sys.stderr, flush=True)
                        row["raw_data"] = str(row["raw_data"])
                
                # 构建值和占位符
                values = [
                    str(row["source_file"]),
                    str(row["row_number"]),
                    str(row["column_name"]),
                    str(row["target_column"]),
                    str(row["original_value"]),
                    str(row["raw_data"]),
                    str(row["reason"])
                ]
                
                try:
                    # 使用参数化查询避免SQL注入
                    cursor.execute(
                        """INSERT INTO rejected_rows 
                           (source_file, row_number, column_name, target_column, original_value, raw_data, reason) 
                           VALUES (?, ?, ?, ?, ?, ?, ?)""",
                        values
                    )
                    print(f"成功插入被拒绝行: {row['column_name']}={row['original_value']}", file=sys.stderr, flush=True)
                except sqlite3.Error as sql_error:
                    print(f"插入被拒绝行SQL错误: {str(sql_error)}", file=sys.stderr, flush=True)
                    print(f"问题数据: {values}", file=sys.stderr, flush=True)
                    # 尝试一种更安全的插入方法，直接执行SQL
                    try:
                        sql = f"""INSERT INTO rejected_rows 
                                  (source_file, row_number, column_name, target_column, original_value, raw_data, reason)
                                  VALUES 
                                  ('{values[0].replace("'", "''")}', 
                                   '{values[1].replace("'", "''")}', 
                                   '{values[2].replace("'", "''")}', 
                                   '{values[3].replace("'", "''")}', 
                                   '{values[4].replace("'", "''")}', 
                                   '{values[5].replace("'", "''")}', 
                                   '{values[6].replace("'", "''")}')"""
                        cursor.execute(sql)
                        print("使用替代方法成功插入被拒绝行", file=sys.stderr, flush=True)
                    except sqlite3.Error as alt_error:
                        print(f"替代方法也失败: {str(alt_error)}", file=sys.stderr, flush=True)
                except Exception as e:
                    print(f"插入被拒绝行时发生未知错误: {str(e)}", file=sys.stderr, flush=True)
                    print(f"问题数据: {values}", file=sys.stderr, flush=True)
            
            # 主连接提交
            try:
                conn.commit()
                print(f"完成插入被拒绝行，提交成功", file=sys.stderr, flush=True)
            except sqlite3.Error as commit_error:
                print(f"提交被拒绝行时发生错误: {str(commit_error)}", file=sys.stderr, flush=True)
                
    except Exception as e:
        print(f"插入数据错误: {str(e)}", file=sys.stderr, flush=True)
        traceback.print_exc(file=sys.stderr)
        
@app.route('/api/query-database', methods=['POST'])
def query_database():
    """Query the database with filters and sorting"""
    # 验证请求
    validation = verify_request()
    if validation:
        return jsonify(validation[0]), validation[1]
        
    data = request.json
    db_path = data.get('db_path')
    filters = data.get('filters', [])
    sort_by = data.get('sort_by', None)
    sort_direction = data.get('sort_direction', 'asc')
    page = data.get('page', 1)
    page_size = data.get('page_size', 100)

    if not db_path:
        return jsonify({"status": "error", "message": "Missing database path"}), 400

    try:
        conn = sqlite3.connect(db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        # Build query
        query = "SELECT * FROM transactions"
        params = []

        # Add filters
        if filters:
            filter_conditions = []
            for f in filters:
                column = f.get('column')
                operator = f.get('operator', '=')
                value = f.get('value')

                if column:
                    if operator == 'not_null':
                        filter_conditions.append(f"{column} IS NOT NULL AND {column} != ''")
                    elif operator == 'contains':
                        filter_conditions.append(f"{column} LIKE ?")
                        params.append(f"%{value}%")
                    elif operator == 'startswith':
                        filter_conditions.append(f"{column} LIKE ?")
                        params.append(f"{value}%")
                    elif operator == 'endswith':
                        filter_conditions.append(f"{column} LIKE ?")
                        params.append(f"%{value}")
                    else:
                        filter_conditions.append(f"{column} {operator} ?")
                        params.append(value)

            if filter_conditions:
                query += " WHERE " + " AND ".join(filter_conditions)

        # Add sorting
        if sort_by:
            query += f" ORDER BY {sort_by} {'DESC' if sort_direction.lower() == 'desc' else 'ASC'}"

        # Get total count
        count_query = f"SELECT COUNT(*) FROM ({query})"
        cursor.execute(count_query, params)
        total_count = cursor.fetchone()[0]

        # Add pagination
        offset = (page - 1) * page_size
        query += f" LIMIT {page_size} OFFSET {offset}"

        # Execute query
        cursor.execute(query, params)
        rows = cursor.fetchall()

        # Convert to list of dicts
        results = []
        for row in rows:
            results.append({key: row[key] for key in row.keys()})

        conn.close()

        return jsonify({
            "status": "success",
            "total_count": total_count,
            "page": page,
            "page_size": page_size,
            "results": results
        })
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/check-database', methods=['POST'])
def check_database():
    """检查数据库结构和潜在问题"""
    # 验证请求
    validation = verify_request()
    if validation:
        return jsonify(validation[0]), validation[1]
        
    data = request.json
    db_path = data.get('db_path')

    if not db_path:
        return jsonify({"status": "error", "message": "缺少数据库路径"}), 400
    
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        tables = []
        errors = []
    
        # 检查表是否存在
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
        table_names = [row[0] for row in cursor.fetchall()]
        
        if 'transactions' not in table_names:
            errors.append("transactions表不存在")
        
        if 'rejected_rows' not in table_names:
            errors.append("rejected_rows表不存在")
        
        # 获取表结构
        for table_name in table_names:
            cursor.execute(f"PRAGMA table_info({table_name})")
            columns = [f"{row[1]} ({row[2]})" for row in cursor.fetchall()]
            tables.append({"name": table_name, "columns": columns})
            
            # 检查字段类型是否合适
            if table_name == 'transactions':
                id_type = None
                row_number_type = None
                
                for row in cursor.execute(f"PRAGMA table_info({table_name})"):
                    if row[1] == 'ID':
                        id_type = row[2]
                    elif row[1] == 'row_number':
                        row_number_type = row[2]
                
                if id_type != 'TEXT' and id_type is not None:
                    errors.append(f"transactions表中的ID字段类型为{id_type}，应为TEXT以支持大整数")
                
                if row_number_type != 'TEXT' and row_number_type is not None:
                    errors.append(f"transactions表中的row_number字段类型为{row_number_type}，应为TEXT以支持大整数")
            
            elif table_name == 'rejected_rows':
                row_number_type = None
                
                for row in cursor.execute(f"PRAGMA table_info({table_name})"):
                    if row[1] == 'row_number':
                        row_number_type = row[2]
                
                if row_number_type != 'TEXT' and row_number_type is not None:
                    errors.append(f"rejected_rows表中的row_number字段类型为{row_number_type}，应为TEXT以支持大整数")
        
        # 检查rejected_rows表是否为空
        if 'rejected_rows' in table_names:
            cursor.execute("SELECT COUNT(*) FROM rejected_rows")
            rejected_count = cursor.fetchone()[0]
            
            if rejected_count == 0:
                # 检查日志中可能的错误
                cursor.execute("PRAGMA integrity_check")
                integrity_result = cursor.fetchall()
                
                if integrity_result[0][0] != 'ok':
                    errors.append(f"数据库一致性检查失败: {integrity_result}")
                
                # 检查rejected_rows表是否有正确的索引
                cursor.execute("PRAGMA index_list(rejected_rows)")
                indices = cursor.fetchall()
                
                if not indices:
                    errors.append("rejected_rows表缺少索引，可能影响性能")
        
        conn.close()
    
        return jsonify({
            "status": "success",
            "tables": tables,
            "errors": errors
        })
    except Exception as e:
        return jsonify({"status": "error", "message": str(e), "traceback": traceback.format_exc()}), 500

@app.route('/api/rejected-rows', methods=['POST'])
def get_rejected_rows():
    """Get rejected rows that need manual verification"""
    # 验证请求
    validation = verify_request()
    if validation:
        return jsonify(validation[0]), validation[1]
        
    data = request.json
    db_path = data.get('db_path')
    page = data.get('page', 1)
    page_size = data.get('page_size', 100)

    if not db_path:
        return jsonify({"status": "error", "message": "Missing database path"}), 400

    try:
        conn = sqlite3.connect(db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        # 增加调试信息
        print(f"查询被拒绝行：数据库={db_path}, 页码={page}, 每页={page_size}", file=sys.stderr, flush=True)
        
        # 检查表是否存在
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='rejected_rows'")
        if not cursor.fetchone():
            print("错误: rejected_rows表不存在!", file=sys.stderr, flush=True)
            return jsonify({
                "status": "error", 
                "message": "rejected_rows表不存在，可能数据库结构有问题"
            }), 500

        # 直接检查表中数据
        cursor.execute("SELECT COUNT(*) FROM rejected_rows")
        total_count_result = cursor.fetchone()
        if not total_count_result:
            print("警告: COUNT查询未返回结果", file=sys.stderr, flush=True)
            total_count = 0
        else:
            total_count = total_count_result[0]
            
        print(f"rejected_rows表中有 {total_count} 行数据", file=sys.stderr, flush=True)

        # 获取分页结果
        offset = (page - 1) * page_size
        try:
            cursor.execute(f"SELECT * FROM rejected_rows LIMIT {page_size} OFFSET {offset}")
            rows = cursor.fetchall()
            print(f"查询返回 {len(rows)} 行数据", file=sys.stderr, flush=True)
        except sqlite3.Error as e:
            print(f"查询rejected_rows时发生SQLite错误: {str(e)}", file=sys.stderr, flush=True)
            return jsonify({"status": "error", "message": f"数据库查询错误: {str(e)}"}), 500

        # 转换为字典列表
        results = []
        for row in rows:
            row_dict = {key: row[key] for key in row.keys()}
            
            # 解析raw_data JSON，处理特殊情况
            if 'raw_data' in row_dict and row_dict['raw_data']:
                try:
                    # 处理可能存在的特殊字符串值
                    raw_data_str = row_dict['raw_data']
                    if isinstance(raw_data_str, str):
                        # 预处理可能导致问题的值
                        raw_data_str = (raw_data_str
                            .replace(': NaN,', ': "NaN",')
                            .replace(': Infinity,', ': "Infinity",')
                            .replace(': -Infinity,', ': "-Infinity",')
                            .replace(': NaN}', ': "NaN"}')
                            .replace(': Infinity}', ': "Infinity"}')
                            .replace(': -Infinity}', ': "-Infinity"}'))
                        
                        try:
                            # 尝试解析处理后的JSON
                            row_dict['raw_data'] = json.loads(raw_data_str)
                        except json.JSONDecodeError as json_err:
                            # 如果仍然失败，记录错误并保留原始字符串
                            print(f"警告: JSON解析失败 (ID={row_dict.get('id')}): {str(json_err)}", 
                                file=sys.stderr, flush=True)
                            # 不做任何修改，保留原始字符串
                            # 但确保前端能安全处理
                            # 在这里我们确保字符串不会导致前端JSON解析错误
                            row_dict['raw_data'] = {"原始数据无法解析": raw_data_str[:100] + "..."}
                except Exception as e:
                    print(f"处理raw_data时出错: {str(e)}", file=sys.stderr, flush=True)
                    row_dict['raw_data'] = {"错误": f"数据处理错误: {str(e)}"}
                    
            results.append(row_dict)

        conn.close()

        return jsonify({
            "status": "success",
            "total_count": total_count,
            "page": page,
            "page_size": page_size,
            "results": results
        })
    except Exception as e:
        print(f"获取rejected_rows时发生错误: {str(e)}", file=sys.stderr, flush=True)
        traceback.print_exc(file=sys.stderr)
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/process-rejected-row', methods=['POST'])
def process_rejected_row():
    """Process a manually fixed rejected row with simplified logic"""
    # 验证请求
    validation = verify_request()
    if validation:
        return jsonify(validation[0]), validation[1]
        
    data = request.json
    print(f"接收到处理请求: {data}", file=sys.stderr, flush=True)
    
    db_path = data.get('db_path')
    row_id = data.get('row_id')
    fixed_data = data.get('fixed_data', {})
    action = data.get('action', 'save')  # 'save' or 'delete'
    user_mappings = data.get('user_mappings', {})  # 从前端获取映射关系
    
    if not db_path or row_id is None:
        return jsonify({"status": "error", "message": "Missing database path or row ID"}), 400

    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()

        if action == 'delete':
            # Delete the rejected row
            cursor.execute("DELETE FROM rejected_rows WHERE id = ?", (row_id,))
            conn.commit()
            conn.close()
            return jsonify({"status": "success", "message": f"Rejected row {row_id} deleted successfully"})
            
        # 获取被拒绝的行信息
        cursor.execute("SELECT * FROM rejected_rows WHERE id = ?", (row_id,))
        row = cursor.fetchone()
        if not row:
            return jsonify({"status": "error", "message": f"Rejected row {row_id} not found"}), 404
            
        # 从SQLite结果创建字典
        row_dict = {}
        description = cursor.description or []
        for i, col in enumerate(description):
            row_dict[col[0]] = row[i]
            
        # 提取关键信息
        source_file = fixed_data.get("source_file") or row_dict.get("source_file")
        row_number = str(fixed_data.get("row_number") or row_dict.get("row_number") or "1")
        column_name = row_dict.get('column_name')  # 原始列名
        target_column = row_dict.get('target_column')  # 目标列名
        current_fixing_field = target_column if target_column else column_name  # 当前修复的字段
        
        print(f"处理文件: {source_file}, 行号: {row_number}, 修复字段: {current_fixing_field}", 
              file=sys.stderr, flush=True)
        print(f"用户映射关系: {user_mappings}", file=sys.stderr, flush=True)

        # 查找是否存在现有行
        cursor.execute(
            "SELECT * FROM transactions WHERE source_file = ? AND row_number = ?", 
            (source_file, row_number)
        )
        existing_row = cursor.fetchone()
        
        if existing_row:
            # 如果行已存在，仅更新用户修改的字段
            print(f"找到现有行，仅更新修改的字段", file=sys.stderr, flush=True)
            
            # 更新用户修改的字段
            for field, value in fixed_data.items():
                # 跳过标识字段
                if field in ["source_file", "row_number"]:
                    continue
                    
                # 只处理当前修复的字段和ID字段
                if field == current_fixing_field or field == "ID":
                    # 处理空值和NaN
                    if value is None or value == '' or value == 'NaN':
                        cursor.execute(
                            f"UPDATE transactions SET {field} = NULL WHERE source_file = ? AND row_number = ?",
                            (source_file, row_number)
                        )
                        print(f"将字段 {field} 更新为NULL", file=sys.stderr, flush=True)
                    else:
                        # 特殊处理ID字段，确保以字符串形式存储
                        if field == "ID":
                            value = str(value)
                            
                        cursor.execute(
                            f"UPDATE transactions SET {field} = ? WHERE source_file = ? AND row_number = ?",
                            (value, source_file, row_number)
                        )
                        print(f"更新字段: {field} = {value}", file=sys.stderr, flush=True)
        else:
            # 如果行不存在，需要根据映射关系从原始数据创建新行
            print(f"行不存在，创建新行", file=sys.stderr, flush=True)
            
            # 解析原始数据
            original_data = {}
            try:
                raw_data_str = row_dict.get('raw_data')
                if raw_data_str:
                    # 处理可能的JSON格式问题
                    if isinstance(raw_data_str, str):
                        raw_data_str = (raw_data_str
                            .replace(': NaN,', ': null,')
                            .replace(': Infinity,', ': "Infinity",')
                            .replace(': -Infinity,', ': "-Infinity",')
                            .replace(': NaN}', ': null}')
                            .replace(': Infinity}', ': "Infinity"}')
                            .replace(': -Infinity}', ': "-Infinity"}'))
                    
                    original_data = json.loads(raw_data_str)
                    print(f"成功解析原始数据: {len(original_data)} 个字段", file=sys.stderr, flush=True)
            except Exception as e:
                print(f"解析原始数据失败: {str(e)}", file=sys.stderr, flush=True)
                
            # 创建新行数据
            new_row = {
                "source_file": source_file,
                "row_number": row_number
            }
            
            # 应用用户映射关系，从原始数据填充字段
            template_name = data.get('template_name')
            current_template = templates.get(template_name, templates.get(next(iter(templates))))
            
            for orig_col, target_col in user_mappings.items():
                if not target_col or orig_col not in original_data:
                    continue  # 跳过未映射的列或原始数据中不存在的列
                
                try:
                    # 获取字段类型
                    field_type = "text"  # 默认类型
                    if target_col in current_template:
                        field_type = current_template[target_col]["type"]
                    
                    # 转换值
                    value = original_data[orig_col]
                    if value is not None:
                        converted_value = convert_value(value, field_type)
                        if converted_value is not None:
                            new_row[target_col] = converted_value
                            print(f"从原始数据映射: {orig_col} -> {target_col} = {converted_value}", file=sys.stderr, flush=True)
                except Exception as e:
                    print(f"转换字段 {orig_col} 值失败: {str(e)}", file=sys.stderr, flush=True)
            
            # 应用用户修改的字段值，这些优先级更高
            for field, value in fixed_data.items():
                if field in ["source_file", "row_number"]:
                    continue  # 已经处理过
                
                if value is not None and value != 'NaN' and value != '':
                    new_row[field] = value
                    print(f"使用用户提供的值: {field} = {value}", file=sys.stderr, flush=True)
                elif field == current_fixing_field:
                    # 如果是当前修复的字段，即使为空也设置为NULL
                    new_row[field] = None
                    print(f"设置字段为NULL: {field}", file=sys.stderr, flush=True)
            
            # 插入新行
            if len(new_row) > 2:  # 确保至少有一个非标识字段
                columns = list(new_row.keys())
                values = list(new_row.values())
                placeholders = ", ".join(["?" for _ in columns])
                
                try:
                    cursor.execute(
                        f"INSERT INTO transactions ({', '.join(columns)}) VALUES ({placeholders})",
                        values
                    )
                    print(f"成功插入新行: {columns} = {values}", file=sys.stderr, flush=True)
                except sqlite3.Error as e:
                    print(f"插入新行失败: {str(e)}", file=sys.stderr, flush=True)
                    raise e
            else:
                print("警告: 没有足够的数据创建新行", file=sys.stderr, flush=True)
        
        # 删除已处理的拒绝行
        cursor.execute("DELETE FROM rejected_rows WHERE id = ?", (row_id,))
        
        conn.commit()
        conn.close()
        
        return jsonify({
            "status": "success",
            "message": f"Rejected row {row_id} processed successfully"
        })
    except Exception as e:
        print(f"处理拒绝行失败: {str(e)}", file=sys.stderr, flush=True)
        traceback.print_exc(file=sys.stderr)
        
        try:
            if 'conn' in locals() and conn:
                conn.close()
        except:
            pass
            
        return jsonify({"status": "error", "message": str(e)}), 500
        
@app.route('/api/export-excel', methods=['POST'])
def export_excel():
    """Export query results to Excel"""
    # 验证请求
    validation = verify_request()
    if validation:
        return jsonify(validation[0]), validation[1]
        
    data = request.json
    db_path = data.get('db_path')
    export_path = data.get('export_path')
    filters = data.get('filters', [])
    sort_by = data.get('sort_by', None)
    sort_direction = data.get('sort_direction', 'asc')

    if not db_path or not export_path:
        return jsonify({"status": "error", "message": "Missing database path or export path"}), 400

    try:
        conn = sqlite3.connect(db_path)

        # Build query
        query = "SELECT * FROM transactions"
        params = []

        # Add filters
        if filters:
            filter_conditions = []
            for f in filters:
                column = f.get('column')
                operator = f.get('operator', '=')
                value = f.get('value')

                if column and value is not None:
                    if operator == 'contains':
                        filter_conditions.append(f"{column} LIKE ?")
                        params.append(f"%{value}%")
                    elif operator == 'startswith':
                        filter_conditions.append(f"{column} LIKE ?")
                        params.append(f"{value}%")
                    elif operator == 'endswith':
                        filter_conditions.append(f"{column} LIKE ?")
                        params.append(f"%{value}")
                    else:
                        filter_conditions.append(f"{column} {operator} ?")
                        params.append(value)

            if filter_conditions:
                query += " WHERE " + " AND ".join(filter_conditions)

        # Add sorting
        if sort_by:
            query += f" ORDER BY {sort_by} {'DESC' if sort_direction.lower() == 'desc' else 'ASC'}"

        # Execute query and load into DataFrame
        df = pd.read_sql_query(query, conn, params=params)

        # Split into multiple files if necessary (max 20,000 rows per file)
        max_rows_per_file = 20000
        num_files = (len(df) + max_rows_per_file - 1) // max_rows_per_file

        export_files = []

        if num_files > 1:
            # Split into multiple files
            for i in range(num_files):
                start_idx = i * max_rows_per_file
                end_idx = min((i + 1) * max_rows_per_file, len(df))

                file_name = f"{os.path.splitext(export_path)[0]}_{i + 1}.xlsx"
                df.iloc[start_idx:end_idx].to_excel(file_name, index=False)
                export_files.append(file_name)
        else:
            # Single file
            df.to_excel(export_path, index=False)
            export_files.append(export_path)

        conn.close()

        return jsonify({
            "status": "success",
            "message": f"Data exported successfully to {len(export_files)} file(s)",
            "export_files": export_files
        })
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route('/api/database-stats', methods=['POST'])
def get_database_stats():
    """Get statistics about the database"""
    # 验证请求
    validation = verify_request()
    if validation:
        return jsonify(validation[0]), validation[1]
        
    data = request.json
    db_path = data.get('db_path')

    if not db_path:
        return jsonify({"status": "error", "message": "Missing database path"}), 400

    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()

        # Get row counts
        cursor.execute("SELECT COUNT(*) FROM transactions")
        total_rows = cursor.fetchone()[0]

        cursor.execute("SELECT COUNT(*) FROM rejected_rows")
        rejected_rows = cursor.fetchone()[0]

        # Get unique source files
        cursor.execute("SELECT COUNT(DISTINCT source_file) FROM transactions")
        unique_files = cursor.fetchone()[0]

        # Get date range
        cursor.execute("SELECT MIN(记账日期), MAX(记账日期) FROM transactions")
        date_range = cursor.fetchone()

        # Get top 5 accounts by transaction count
        cursor.execute("""
        SELECT 账号, COUNT(*) as count
        FROM transactions
        GROUP BY 账号
        ORDER BY count DESC
        LIMIT 5
        """)
        top_accounts = [{"账号": row[0], "count": row[1]} for row in cursor.fetchall()]

        conn.close()

        return jsonify({
            "status": "success",
            "total_rows": total_rows,
            "rejected_rows": rejected_rows,
            "unique_files": unique_files,
            "date_range": date_range,
            "top_accounts": top_accounts
        })
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route('/api/update-synonyms', methods=['POST'])
def update_synonyms():
    """Update synonyms for a template field"""
    # 验证请求
    validation = verify_request()
    if validation:
        return jsonify(validation[0]), validation[1]
        
    data = request.json
    template_name = data.get('template_name')
    field_name = data.get('field_name')
    synonyms = data.get('synonyms', [])

    if not template_name or not field_name:
        return jsonify({"status": "error", "message": "Missing template name or field name"}), 400

    if template_name not in templates:
        return jsonify({"status": "error", "message": f"Template '{template_name}' not found"}), 404

    if field_name not in templates[template_name]:
        return jsonify({"status": "error", "message": f"Field '{field_name}' not found in template"}), 404

    templates[template_name][field_name]["synonyms"] = synonyms

    return jsonify({
        "status": "success",
        "message": f"Synonyms updated for field '{field_name}' in template '{template_name}'"
    })

# 新增端口检查和服务启动函数
def find_available_port(start_port, max_attempts=10):
    """查找可用端口"""
    port = start_port
    attempts = 0
    
    while attempts < max_attempts:
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                s.bind(('127.0.0.1', port))
                return port
        except socket.error:
            attempts += 1
            port += 1
    
    # 如果找不到可用端口，返回原始端口，将在稍后处理错误
    return start_port

if __name__ == '__main__':
    # 检查是否有开发模式参数
    if len(sys.argv) > 1 and sys.argv[1].lower() == 'dev':
        print("启动开发模式，跳过验证...")
        # 在开发模式下直接启动
        app.run(host='127.0.0.1', port=51234, debug=True)
    else:
        # 验证硬件和过期状态
        hardware_valid = verify_hardware()
        expired = check_expiration()
        
        if expired:
            print("应用已过期，拒绝启动服务", file=sys.stderr)
            print("提示：使用 'python backend.py dev' 启动开发模式", file=sys.stderr)
            sys.exit(1)
        
        if not hardware_valid:
            print("硬件验证失败，拒绝启动服务", file=sys.stderr)
            print("提示：使用 'python backend.py dev' 启动开发模式", file=sys.stderr)
            sys.exit(2)
        
        # 获取目标端口
        target_port = int(os.environ.get('TARGET_PORT', '51234'))
        port = find_available_port(target_port)
        
        if port != target_port:
            print(f"警告: 端口 {target_port} 已被占用，使用备用端口 {port}", file=sys.stderr)
        
        # 打印启动日志
        print(f"后端服务启动在端口: {port}", file=sys.stderr)
        
        try:
            app.run(host='127.0.0.1', port=port, debug=False)
        except Exception as e:
            print(f"启动服务失败: {e}", file=sys.stderr)
            sys.exit(3)