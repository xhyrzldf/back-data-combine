from dateutil import parser
import re
from datetime import datetime

def parse_date(value):
    """
    使用dateutil库解析多种格式的日期
    
    Args:
        value: 要解析的日期字符串
        
    Returns:
        str: 标准格式的日期字符串 (YYYY-MM-DD)，转换失败则返回None
    """
    if not value:
        return None
    
    # 确保是字符串
    str_value = str(value).strip()
    
    # 处理带小数点的数值（如"20210610.0"）
    if '.' in str_value and str_value.split('.')[1] == '0':
        try:
            # 尝试提取整数部分
            int_part = str_value.split('.')[0]
            if int_part.isdigit():
                str_value = int_part  # 使用整数部分
        except Exception:
            pass
    
    # 处理YYMMDD格式 (例如: 210305)
    if re.match(r'^\d{6}$', str_value):
        yy = str_value[:2]
        mm = str_value[2:4]
        dd = str_value[4:6]
        
        try:
            # 合法性检查
            month = int(mm)
            day = int(dd)
            if 1 <= month <= 12 and 1 <= day <= 31:
                # 推断世纪
                year = 2000 + int(yy) if int(yy) < 50 else 1900 + int(yy)
                return f"{year}-{mm}-{dd}"
        except ValueError:
            pass
    
    # 处理YYYYMMDD格式 (例如: 20210305)
    if re.match(r'^\d{8}$', str_value):
        yyyy = str_value[:4]
        mm = str_value[4:6]
        dd = str_value[6:8]
        
        try:
            # 合法性检查
            month = int(mm)
            day = int(dd)
            if 1 <= month <= 12 and 1 <= day <= 31:
                return f"{yyyy}-{mm}-{dd}"
        except ValueError:
            pass
    
    # 使用dateutil解析其他格式
    try:
        parsed_date = parser.parse(str_value, dayfirst=False, yearfirst=True)
        return parsed_date.strftime('%Y-%m-%d')
    except Exception:
        # 如果yearfirst=True失败，尝试其他解析方式
        try:
            parsed_date = parser.parse(str_value, dayfirst=True)
            return parsed_date.strftime('%Y-%m-%d')
        except Exception:
            return None
            
def parse_time(value):
    """
    解析多种格式的时间
    
    Args:
        value: 要解析的时间字符串
        
    Returns:
        str: 标准格式的时间字符串 (HH:MM:SS)，转换失败则返回None
    """
    if not value:
        return None
    
    # 转为字符串
    value = str(value).strip()
    
    # 处理HHMMSS格式 (例如: 235959)
    if re.match(r'^\d{6}$', value):
        hh = value[:2]
        mm = value[2:4]
        ss = value[4:6]
        
        try:
            # 合法性检查
            hour = int(hh)
            minute = int(mm)
            second = int(ss)
            if 0 <= hour <= 23 and 0 <= minute <= 59 and 0 <= second <= 59:
                return f"{hh}:{mm}:{ss}"
        except ValueError:
            pass
    
    # 处理HHMM格式 (例如: 2359)
    if re.match(r'^\d{4}$', value):
        hh = value[:2]
        mm = value[2:4]
        
        try:
            # 合法性检查
            hour = int(hh)
            minute = int(mm)
            if 0 <= hour <= 23 and 0 <= minute <= 59:
                return f"{hh}:{mm}:00"
        except ValueError:
            pass

    # 处理5位数格式 (例如: 22805 表示 02:28:05)
    if re.match(r'^\d{5}$', value):
        # 处理5位数时间格式
        if len(value) == 5:
            h = value[0]       # 第一位是小时
            mm = value[1:3]    # 第2-3位是分钟
            ss = value[3:5]    # 第4-5位是秒钟
            
            try:
                # 合法性检查
                hour = int(h)
                minute = int(mm)
                second = int(ss)
                if 0 <= hour <= 23 and 0 <= minute <= 59 and 0 <= second <= 59:
                    return f"0{h}:{mm}:{ss}"
            except ValueError:
                pass
    
    # 处理标准格式
    for fmt in ('%H:%M:%S', '%H:%M', '%I:%M:%S %p', '%I:%M %p'):
        try:
            time_obj = datetime.strptime(value, fmt)
            return time_obj.strftime('%H:%M:%S')
        except ValueError:
            continue
    
    # 处理带有毫秒的时间
    try:
        if '.' in value and re.match(r'\d+:\d+:\d+\.\d+', value):
            parts = value.split('.')
            base_time = datetime.strptime(parts[0], '%H:%M:%S')
            return base_time.strftime('%H:%M:%S')
    except ValueError:
        pass
    
    # 处理Excel数字时间格式（0.75 = 18:00:00）
    try:
        if re.match(r'^\d*\.\d+$', value):  # 只有小数部分
            float_val = float(value)
            if 0 <= float_val < 1:  # 在合理的时间范围内
                total_seconds = int(float_val * 24 * 60 * 60)
                hours = total_seconds // 3600
                minutes = (total_seconds % 3600) // 60
                seconds = total_seconds % 60
                return f"{hours:02d}:{minutes:02d}:{seconds:02d}"
    except ValueError:
        pass
    
    # 处理中文时间格式
    try:
        if '时' in value or '分' in value:
            match = re.match(r'(\d{1,2})\s*时\s*(?:(\d{1,2})\s*分)?\s*(?:(\d{1,2})\s*秒)?', value)
            if match:
                hour, minute, second = match.groups()
                hour = int(hour)
                minute = int(minute) if minute else 0
                second = int(second) if second else 0
                
                if 0 <= hour <= 23 and 0 <= minute <= 59 and 0 <= second <= 59:
                    return f"{hour:02d}:{minute:02d}:{second:02d}"
    except Exception:
        pass
    
    return None