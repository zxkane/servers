import asyncio
import json
from typing import Any, Dict, List, Sequence

from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp.types import Tool, TextContent, ImageContent, EmbeddedResource
from mcp.shared.exceptions import McpError

from mcp_server_datagen.synthetic import SyntheticDataGenerator


class DataGenServer:
    """MCP server for generating notional data."""

    def __init__(self):
        self.default_schemas = {
            "customers": {
                "customer_id": {
                    "type": "int",
                    "generator": "numpy",
                    "min": 10000,
                    "max": 99999
                },
                "first_name": {
                    "type": "first_name",
                    "generator": "faker"
                },
                "last_name": {
                    "type": "last_name",
                    "generator": "faker"
                },
                "email": {
                    "type": "email",
                    "generator": "faker"
                },
                "phone": {
                    "type": "phone_number",
                    "generator": "faker"
                },
                "address": {
                    "type": "address",
                    "generator": "faker"
                },
                "date_of_birth": {
                    "type": "date_of_birth",
                    "generator": "faker"
                },
                "credit_score": {
                    "type": "int",
                    "generator": "numpy",
                    "min": 300,
                    "max": 850
                }
            },
            "policies": {
                "policy_id": {
                    "type": "int",
                    "generator": "numpy",
                    "min": 100000,
                    "max": 999999
                },
                "customer_id": {
                    "type": "int",
                    "generator": "numpy",
                    "min": 10000,
                    "max": 99999,
                    "correlated": True
                },
                "policy_type": {
                    "type": "category",
                    "generator": "numpy",
                    "categories": ["auto", "home", "life", "health"]
                },
                "start_date": {
                    "type": "date_this_decade",
                    "generator": "faker"
                },
                "end_date": {
                    "type": "date_this_decade",
                    "generator": "faker"
                },
                "premium": {
                    "type": "float",
                    "generator": "numpy",
                    "min": 500.0,
                    "max": 5000.0
                },
                "coverage_amount": {
                    "type": "float",
                    "generator": "numpy",
                    "min": 50000.0,
                    "max": 1000000.0
                },
                "status": {
                    "type": "category",
                    "generator": "numpy",
                    "categories": ["active", "expired", "cancelled", "pending"]
                }
            },
            "claims": {
                "claim_id": {
                    "type": "int",
                    "generator": "numpy",
                    "min": 1000000,
                    "max": 9999999
                },
                "policy_id": {
                    "type": "int",
                    "generator": "numpy",
                    "min": 100000,
                    "max": 999999,
                    "correlated": True
                },
                "date_filed": {
                    "type": "date_this_year",
                    "generator": "faker"
                },
                "incident_date": {
                    "type": "date_this_year",
                    "generator": "faker"
                },
                "claim_type": {
                    "type": "category",
                    "generator": "numpy",
                    "categories": ["accident", "theft", "natural_disaster", "medical", "property_damage"]
                },
                "amount_claimed": {
                    "type": "float",
                    "generator": "numpy",
                    "min": 1000.0,
                    "max": 100000.0
                },
                "status": {
                    "type": "category",
                    "generator": "numpy",
                    "categories": ["pending", "approved", "denied", "in_review"]
                },
                "description": {
                    "type": "text",
                    "generator": "faker"
                }
            }
        }
        self.generator = SyntheticDataGenerator()
        self.generator.default_schemas = self.default_schemas

    async def list_tools(self) -> List[Tool]:
        """List available data generation tools."""
        return [
            Tool(
                name="generate_tables",
                description="Generate multiple tables of notional data",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "tables": {
                            "type": "array",
                            "items": {"type": "string"}
                        },
                        "rows": {"type": "integer", "minimum": 1},
                        "schemas": {
                            "type": "object",
                            "additionalProperties": {
                                "type": "object",
                                "additionalProperties": {
                                    "type": "object",
                                    "properties": {
                                        "type": {"type": "string"},
                                        "generator": {"type": "string"},
                                        "min": {"type": "number"},
                                        "max": {"type": "number"},
                                        "categories": {
                                            "type": "array",
                                            "items": {"type": "string"}
                                        }
                                    }
                                }
                            }
                        }
                    },
                    "required": ["tables"]
                }
            )
        ]

    async def handle_generate_tables(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Handle generate_tables tool requests."""
        tables = params.get("tables", [])
        rows = params.get("rows", 1000)
        custom_schemas = params.get("schemas", {})

        if rows <= 0:
            raise ValueError("Row count must be positive")

        results = {}
        try:
            for table_name in tables:
                if table_name not in self.default_schemas and table_name not in custom_schemas:
                    raise ValueError(f"Unknown table: {table_name}")

                # Use custom schema if provided, otherwise use default
                schema = custom_schemas.get(table_name, self.default_schemas.get(table_name, {}))
                data = await self.generator.generate_synthetic_data(
                    table_name=table_name,
                    schema=schema,
                    rows=rows
                )
                results[table_name] = data

            return results

        except ValueError as e:
            # Re-raise validation errors directly
            raise e
        except Exception as e:
            # Wrap unexpected errors in McpError
            raise McpError(f"Error generating data: {str(e)}")


async def serve() -> None:
    """Start the MCP server."""
    server = Server("mcp-datagen")
    datagen_server = DataGenServer()

    @server.list_tools()
    async def list_tools() -> List[Tool]:
        """List available data generation tools."""
        return await datagen_server.list_tools()

    @server.call_tool()
    async def call_tool(
        name: str, arguments: Dict[str, Any]
    ) -> Sequence[TextContent | ImageContent | EmbeddedResource]:
        """Handle tool calls."""
        if name == "generate_tables":
            result = await datagen_server.handle_generate_tables(arguments)
            return [
                TextContent(
                    type="text",
                    text=json.dumps({"tables": result}, indent=2)
                )
            ]
        raise McpError(f"Unknown tool: {name}")

    options = server.create_initialization_options()
    async with stdio_server() as (read_stream, write_stream):
        await server.run(read_stream, write_stream, options)


if __name__ == "__main__":
    asyncio.run(serve())
