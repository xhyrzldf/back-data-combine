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

app = Flask(__name__)
CORS(app)

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


# Utility Functions
def create_database(db_path):
    """Create a new SQLite database with the standard schema"""
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    # Create main table with standard columns
    columns = [
        "ID INTEGER PRIMARY KEY",
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
        "row_number INTEGER"
    ]

    cursor.execute(f"CREATE TABLE IF NOT EXISTS transactions ({', '.join(columns)})")

    # Create a table for rejected rows that need manual verification
    cursor.execute(f"""
    CREATE TABLE IF NOT EXISTS rejected_rows (
        id INTEGER PRIMARY KEY,
        source_file TEXT,
        row_number INTEGER,
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
    """Convert a value to the target data type"""
    if pd.isna(value):
        return None

    value = str(value).strip()
    if not value:
        return None

    try:
        if target_type == "int":
            return int(float(value))
        elif target_type == "float":
            return float(value)
        elif target_type == "date":
            # Try various date formats
            for fmt in ('%Y-%m-%d', '%Y/%m/%d', '%d-%m-%Y', '%d/%m/%Y', '%Y%m%d'):
                try:
                    date_obj = datetime.strptime(value, fmt)
                    return date_obj.strftime('%Y-%m-%d')
                except ValueError:
                    continue
            # If no format worked, return as is
            return value
        elif target_type == "time":
            # Try various time formats
            for fmt in ('%H:%M:%S', '%H:%M', '%I:%M:%S %p', '%I:%M %p'):
                try:
                    time_obj = datetime.strptime(value, fmt)
                    return time_obj.strftime('%H:%M:%S')
                except ValueError:
                    continue
            # If no format worked, return as is
            return value
        else:
            return value
    except:
        # If conversion fails, return as is
        return value


# API Routes
@app.route('/api/ping', methods=['GET'])
def ping():
    """Simple ping endpoint to test if server is running"""
    return jsonify({"status": "success", "message": "Backend is running"})


@app.route('/api/templates', methods=['GET'])
def get_templates():
    """Get all templates"""
    return jsonify({
        "status": "success",
        "templates": templates,
        "default_template": list(templates.keys())[0] if templates else None
    })


@app.route('/api/templates', methods=['POST'])
def save_template():
    """Save a new template or update existing one"""
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
    if name in templates:
        del templates[name]
        return jsonify({"status": "success", "message": f"Template '{name}' deleted"})
    return jsonify({"status": "error", "message": f"Template '{name}' not found"}), 404


@app.route('/api/recent-files', methods=['GET'])
def get_recent_files():
    """Get list of recent files"""
    return jsonify({
        "status": "success",
        "recent_files": recent_files
    })


@app.route('/api/analyze-file', methods=['POST'])
def analyze_file():
    """Analyze a single Excel file and detect columns"""
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
    data = request.json
    file_paths = data.get('file_paths', [])
    db_path = data.get('db_path')
    column_mappings = data.get('column_mappings', {})

    if not file_paths or not db_path:
        return jsonify({"status": "error", "message": "Missing file paths or database path"}), 400

    try:
        # Create database
        create_database(db_path)
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()

        total_processed = 0
        total_rejected = 0
        file_stats = []

        for file_idx, file_path in enumerate(file_paths):
            try:
                # Read Excel file
                df = pd.read_excel(file_path)

                # Apply column mappings
                mapped_data = []
                rejected_rows = []

                for idx, row in df.iterrows():
                    try:
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
                            "source_file": os.path.basename(file_path),
                            "row_number": idx + 1
                        }

                        has_data = False
                        for orig_col, target_col in column_mappings.items():
                            if orig_col in df.columns and target_col:
                                value = row[orig_col]
                                if pd.notna(value) and str(value).strip():
                                    has_data = True

                                # Get target type from template
                                target_type = "text"  # Default
                                for template in templates.values():
                                    if target_col in template:
                                        target_type = template[target_col]["type"]
                                        break

                                # Convert value to the right type
                                mapped_row[target_col] = convert_value(value, target_type)

                        # Skip if row is empty
                        if not has_data:
                            continue

                        mapped_data.append(mapped_row)
                    except Exception as e:
                        # Add to rejected rows
                        rejected_rows.append({
                            "source_file": os.path.basename(file_path),
                            "row_number": idx + 1,
                            "raw_data": json.dumps(row.to_dict()),
                            "reason": str(e)
                        })

                # Insert mapped data
                if mapped_data:
                    columns = list(mapped_data[0].keys())
                    placeholders = ", ".join(["?" for _ in columns])
                    insert_query = f"INSERT INTO transactions ({', '.join(columns)}) VALUES ({placeholders})"

                    for row in mapped_data:
                        values = [row[col] for col in columns]
                        cursor.execute(insert_query, values)

                # Insert rejected rows
                if rejected_rows:
                    for row in rejected_rows:
                        cursor.execute(
                            "INSERT INTO rejected_rows (source_file, row_number, raw_data, reason) VALUES (?, ?, ?, ?)",
                            (row["source_file"], row["row_number"], row["raw_data"], row["reason"])
                        )

                total_processed += len(mapped_data)
                total_rejected += len(rejected_rows)

                file_stats.append({
                    "file_name": os.path.basename(file_path),
                    "total_rows": len(df),
                    "processed_rows": len(mapped_data),
                    "rejected_rows": len(rejected_rows)
                })

                # Commit after each file to avoid memory issues
                conn.commit()

                # Update progress
                progress = (file_idx + 1) / len(file_paths) * 100
                print(f"Progress: {progress:.2f}%", file=sys.stderr)

            except Exception as e:
                file_stats.append({
                    "file_name": os.path.basename(file_path),
                    "error": str(e)
                })

        conn.commit()
        conn.close()

        # Update recent files
        update_recent_files(db_path)

        return jsonify({
            "status": "success",
            "db_path": db_path,
            "total_processed": total_processed,
            "total_rejected": total_rejected,
            "file_stats": file_stats
        })
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route('/api/query-database', methods=['POST'])
def query_database():
    """Query the database with filters and sorting"""
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


@app.route('/api/rejected-rows', methods=['POST'])
def get_rejected_rows():
    """Get rejected rows that need manual verification"""
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

        # Get total count
        cursor.execute("SELECT COUNT(*) FROM rejected_rows")
        total_count = cursor.fetchone()[0]

        # Get paginated results
        offset = (page - 1) * page_size
        cursor.execute(f"SELECT * FROM rejected_rows LIMIT {page_size} OFFSET {offset}")
        rows = cursor.fetchall()

        # Convert to list of dicts
        results = []
        for row in rows:
            row_dict = {key: row[key] for key in row.keys()}
            # Parse raw_data JSON
            if 'raw_data' in row_dict:
                try:
                    row_dict['raw_data'] = json.loads(row_dict['raw_data'])
                except:
                    pass
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
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route('/api/process-rejected-row', methods=['POST'])
def process_rejected_row():
    """Process a manually fixed rejected row"""
    data = request.json
    db_path = data.get('db_path')
    row_id = data.get('row_id')
    fixed_data = data.get('fixed_data', {})
    action = data.get('action', 'save')  # 'save' or 'delete'

    if not db_path or row_id is None:
        return jsonify({"status": "error", "message": "Missing database path or row ID"}), 400

    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()

        if action == 'delete':
            # Delete the rejected row
            cursor.execute("DELETE FROM rejected_rows WHERE id = ?", (row_id,))
        elif action == 'save':
            # Get the rejected row
            cursor.execute("SELECT * FROM rejected_rows WHERE id = ?", (row_id,))
            row = cursor.fetchone()

            if not row:
                return jsonify({"status": "error", "message": f"Rejected row {row_id} not found"}), 404

            # Insert the fixed data into transactions
            columns = list(fixed_data.keys())
            placeholders = ", ".join(["?" for _ in columns])
            values = [fixed_data[col] for col in columns]

            cursor.execute(f"INSERT INTO transactions ({', '.join(columns)}) VALUES ({placeholders})", values)

            # Delete the rejected row
            cursor.execute("DELETE FROM rejected_rows WHERE id = ?", (row_id,))

        conn.commit()
        conn.close()

        return jsonify({
            "status": "success",
            "message": f"Rejected row {row_id} processed successfully"
        })
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route('/api/export-excel', methods=['POST'])
def export_excel():
    """Export query results to Excel"""
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


if __name__ == '__main__':
    app.run(port=5000, debug=True)