import asyncio
from mcp import ClientSession, StdioServerParameters
from mcp.client.sse import sse_client

# Adresa tvého serveru
# Traefik to přesměruje z /mcp/sse na /sse uvnitř kontejneru
# MCP_SERVER_URL = "https://api.clearway.zephyron.tech/mcp/sse"
MCP_SERVER_URL = "http://localhost:8001/sse"       

async def run():
    print(f"🔌 Připojuji se k MCP serveru na: {MCP_SERVER_URL}...")

    # Navážeme SSE spojení
    async with sse_client(MCP_SERVER_URL) as (read_stream, write_stream):
        print("✅ SSE Spojení navázáno! Inicializuji relaci...")
        
        async with ClientSession(read_stream, write_stream) as session:
            # 1. Inicializace
            await session.initialize()
            print("🚀 Session inicializována.")

            # 2. Výpis dostupných nástrojů (Tools)
            print("\n📋 Dostupné nástroje (Tools):")
            tools = await session.list_tools()
            for tool in tools.tools:
                print(f"  - {tool.name}: {tool.description}")

            # 3. Testovací volání nástroje: get_daily_analytics
            # Zkusíme si vyžádat data pro dnešek
            target_date = "2026-02-01"
            print(f"\n📞 Volám nástroj 'get_daily_analytics' pro datum {target_date}...")
            
            result = await session.call_tool(
                "get_daily_analytics",
                arguments={"target_date": target_date}
            )

            # 4. Výpis výsledku
            print("\n💡 Odpověď serveru:")
            # MCP vrací seznam obsahů (text, image, atd.)
            for content in result.content:
                if content.type == "text":
                    print(content.text)
                else:
                    print(content)

if __name__ == "__main__":
    asyncio.run(run())