from datetime import date
from fastmcp import FastMCP
from sqlalchemy import inspect, text
from app.database import engine, SessionLocal

schema_server = FastMCP("ClearWay Schema")


@schema_server.tool()
def describe_schema() -> list[dict]:
    """
    Returns the full database schema: every table with its columns, data types,
    nullable flag, primary-key flag, and any foreign-key reference.
    Use this before writing SQL to understand the exact structure.
    """
    insp = inspect(engine)
    tables = []
    for table_name in sorted(insp.get_table_names()):
        pk_cols = set(insp.get_pk_constraint(table_name).get("constrained_columns", []))
        fk_map: dict[str, str] = {}
        for fk in insp.get_foreign_keys(table_name):
            for local_col, ref_col in zip(
                fk["constrained_columns"], fk["referred_columns"]
            ):
                fk_map[local_col] = f"{fk['referred_table']}.{ref_col}"

        columns = []
        for col in insp.get_columns(table_name):
            columns.append({
                "name": col["name"],
                "type": str(col["type"]),
                "nullable": col["nullable"],
                "primary_key": col["name"] in pk_cols,
                "foreign_key": fk_map.get(col["name"]),
            })

        tables.append({"table": table_name, "columns": columns})

    return tables


@schema_server.tool()
def run_read_only_sql(query: str) -> list[dict]:
    """
    Executes a read-only SQL query against the database.

    Args:
        query: A SELECT statement. Modification commands (DROP, DELETE, INSERT,
               UPDATE, TRUNCATE) are blocked.

    Returns:
        A list of row dicts. Datetime values are ISO-formatted strings.
    """
    query_str = query.strip()

    if not query_str.upper().startswith("SELECT"):
        raise ValueError("Only SELECT queries are allowed.")

    forbidden = ["DROP", "DELETE", "INSERT", "UPDATE", "TRUNCATE"]
    if any(kw in query_str.upper() for kw in forbidden):
        raise ValueError("Forbidden SQL keyword detected. Only read-only queries are allowed.")

    with SessionLocal() as db:
        try:
            rows = db.execute(text(query_str)).mappings().all()
            output = []
            for row in rows:
                row_dict = dict(row)
                for key, value in row_dict.items():
                    if isinstance(value, (date,)):
                        row_dict[key] = value.isoformat()
                output.append(row_dict)
            return output
        except Exception as e:
            return [{"error": str(e)}]
