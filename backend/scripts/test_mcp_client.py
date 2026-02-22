import asyncio
import os
import logging
from mcp import ClientSession
from mcp.client.sse import sse_client

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger(__name__)

# Server configuration
# Default to localhost for testing, but allow override via environment variable
# MCP_SERVER_URL = os.getenv("MCP_SERVER_URL", "http://localhost:8001/sse")
MCP_SERVER_URL = os.getenv("MCP_SERVER_URL", "https://api.clearway.zephyron.tech/mcp/sse")

async def run_client():
    """
    Connects to the ClearWay MCP server via SSE, lists available tools,
    and executes a test call to the 'get_daily_analytics' tool.
    """
    logger.info(f"🔌 Connecting to MCP server at: {MCP_SERVER_URL}...")

    try:
        # Establish SSE connection
        async with sse_client(MCP_SERVER_URL) as (read_stream, write_stream):
            logger.info("✅ SSE connection established. Initializing session...")
            
            async with ClientSession(read_stream, write_stream) as session:
                # 1. Initialize session
                await session.initialize()
                logger.info("🚀 Session successfully initialized.")

                # 2. List available tools
                logger.info("Fetching available tools...")
                tools = await session.list_tools()
                
                print("\n📋 Available Tools:")
                for tool in tools.tools:
                    print(f"  - {tool.name}: {tool.description}")
                print("-" * 50)

                # 3. Test execution: get_daily_analytics
                target_date = "2026-02-18"
                logger.info(f"📞 Invoking tool 'get_daily_analytics' for date: {target_date}...")
                
                try:
                    result = await session.call_tool(
                        "get_daily_analytics",
                        arguments={"target_date": target_date}
                    )

                    # 4. Display results
                    print("\n💡 Server Response:")
                    for content in result.content:
                        if content.type == "text":
                            print(content.text)
                        else:
                            print(content)
                            
                except Exception as e:
                    logger.error(f"Failed to execute tool: {e}")

                # 5. Test execution: get_road_features_in_bbox
                logger.info("🌍 Invoking tool 'get_road_features_in_bbox' (Pilsen Center)...")
                bbox_args = {
                    "min_lat": 49.740,
                    "min_lon": 13.370,
                    "max_lat": 49.750,
                    "max_lon": 13.390
                }
                
                try:
                    bbox_result = await session.call_tool(
                        "get_road_features_in_bbox", 
                        arguments=bbox_args
                    )
                    
                    print("\n💡 Bounding Box Results (truncated):")
                    for content in bbox_result.content:
                        if content.type == "text":
                            print(content.text[:500] + "...")
                        else:
                            print(str(content)[:500] + "...")
                except Exception as e:
                    logger.error(f"Failed to execute bbox tool: {e}")

    except Exception as e:
        logger.error(f"Connection error: {e}")

if __name__ == "__main__":
    try:
        asyncio.run(run_client())
    except KeyboardInterrupt:
        logger.info("Client stopped by user.")
