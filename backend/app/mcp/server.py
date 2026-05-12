# Run with: fastmcp run app/mcp/server.py:mcp --transport sse --port 8001

import sys
import os

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from fastmcp import FastMCP
from app.mcp.tools.schema import schema_server
from app.mcp.tools.stats import stats_server
from app.mcp.tools.entities import entities_server
from app.mcp.tools.analysis import analysis_server
from app.mcp.tools.routing import routing_server

mcp = FastMCP("ClearWay Context")

mcp.mount(schema_server, namespace=None)
mcp.mount(stats_server, namespace=None)
mcp.mount(entities_server, namespace=None)
mcp.mount(analysis_server, namespace=None)
mcp.mount(routing_server, namespace=None)
