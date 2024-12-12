"""Synthetic data generation using numpy and faker."""

import datetime
import numpy as np
from faker import Faker
from mimesis import Generic
from typing import Any, Dict, List, Optional, Set, Union

# Default schemas for insurance data generation
DEFAULT_CUSTOMER_SCHEMA = {
    "customer_id": {"type": "integer", "generator": "numpy", "min": 10000, "max": 99999},
    "first_name": {"type": "first_name", "generator": "faker"},
    "last_name": {"type": "last_name", "generator": "faker"},
    "age": {"type": "integer", "generator": "numpy", "min": 18, "max": 85},
    "credit_score": {"type": "integer", "generator": "numpy", "min": 300, "max": 850},
    "active": {"type": "boolean", "generator": "numpy"}
}

DEFAULT_POLICY_SCHEMA = {
    "policy_id": {"type": "integer", "generator": "numpy", "min": 100000, "max": 999999, "prefix": "POL-"},
    "customer_id": {"type": "integer", "generator": "numpy", "min": 10000, "max": 99999, "correlated": True},
    "premium": {"type": "float", "generator": "numpy", "min": 500.0, "max": 5000.0},
    "deductible": {"type": "float", "generator": "numpy", "min": 250.0, "max": 2000.0},
    "coverage_amount": {"type": "integer", "generator": "numpy", "min": 50000, "max": 1000000},
    "risk_score": {"type": "integer", "generator": "numpy", "min": 1, "max": 100},
    "policy_type": {"type": "category", "generator": "numpy", "categories": ["Auto", "Home", "Life", "Health"]},
    "start_date": {"type": "date_this_year", "generator": "faker"}
}

DEFAULT_CLAIMS_SCHEMA = {
    "claim_id": {"type": "integer", "generator": "numpy", "min": 500000, "max": 999999},
    "policy_id": {"type": "integer", "generator": "numpy", "min": 100000, "max": 999999, "correlated": True},
    "amount": {"type": "float", "generator": "numpy", "min": 100.0, "max": 50000.0},
    "status": {"type": "category", "generator": "numpy", "categories": ["Open", "Closed", "Pending", "Denied"]},
    "date_filed": {"type": "date_this_year", "generator": "faker"},
    "description": {"type": "text", "generator": "faker"}
}


class SyntheticDataGenerator:
    """Handles synthetic data generation."""

    def __init__(self):
        """Initialize the synthetic data generator."""
        self.faker = Faker()
        self.mimesis = Generic()
        # Store generated IDs for relationships
        self._generated_ids: Dict[str, Set[Union[int, str]]] = {}
        self._id_counters: Dict[str, int] = {}
        self.default_schemas: Dict[str, Dict[str, Dict[str, Any]]] = {
            "customers": DEFAULT_CUSTOMER_SCHEMA,
            "policies": DEFAULT_POLICY_SCHEMA,
            "claims": DEFAULT_CLAIMS_SCHEMA
        }

    def _map_type_to_generator(self, data_type: str) -> str:
        """Map data type to appropriate generator."""
        # Handle legacy faker.method format
        if "." in data_type:
            return "faker"

        # Direct faker types
        if data_type in {
            "first_name", "last_name", "email", "phone_number",
            "address", "text", "date_this_year", "date_this_decade",
            "date_of_birth", "name", "string"
        }:
            return "faker"

        # Numpy types
        if data_type in {"boolean", "integer", "int", "float", "category"}:
            return "numpy"

        # Default to faker for string types
        return "faker"

    def _map_faker_type(self, data_type: str) -> str:
        """Map data type to Faker method name."""
        # Handle legacy faker.method format
        if "." in data_type:
            return data_type.split(".")[-1]

        # Direct mapping for faker types
        if data_type in {
            "first_name", "last_name", "email", "phone_number",
            "address", "text", "date_this_year", "date_this_decade",
            "date_of_birth", "name", "string"
        }:
            return "text" if data_type == "string" else data_type

        # Legacy type mapping
        type_mapping = {
            "string": "text",
        }
        return type_mapping.get(data_type, "text")

    def _generate_faker_value(self, data_type: str) -> str:
        """Generate a value using Faker."""
        # Handle legacy faker.method format
        if "." in data_type:
            method_name = data_type.split(".")[-1]
        else:
            method_name = data_type

        faker_method = getattr(self.faker, method_name, None)
        if faker_method is None:
            return self.faker.text()  # Default to text if method not found
        return faker_method()

    def _generate_mimesis_value(self, generator: str) -> Any:
        """Generate value using Mimesis."""
        if not generator.startswith("mimesis."):
            return None

        category, method = generator.split(".", 1)[1].split(".")
        if hasattr(self.mimesis, category):
            category_instance = getattr(self.mimesis, category)
            if hasattr(category_instance, method):
                return getattr(category_instance, method)()
        return None

    def _generate_unique_id(self, table_name: str, col_spec: Dict[str, Any]) -> int:
        """Generate a unique ID for a table."""
        # Initialize ID storage and counter for this table if not exists
        if table_name not in self._generated_ids:
            self._generated_ids[table_name] = set()

        # Get ID range from schema
        min_val = col_spec.get("min", 1)
        max_val = col_spec.get("max", 999999)

        # Initialize counter at min_val - 1 if not set
        if table_name not in self._id_counters:
            self._id_counters[table_name] = min_val - 1

        # Try to generate a unique ID within the range
        for _ in range(max_val - min_val + 1):  # Try all possible values in range
            self._id_counters[table_name] += 1
            if self._id_counters[table_name] > max_val:
                self._id_counters[table_name] = min_val

            candidate_id = self._id_counters[table_name]

            # Check if ID is unique
            if candidate_id not in self._generated_ids[table_name]:
                self._generated_ids[table_name].add(candidate_id)
                return candidate_id

        raise ValueError(
            f"Could not generate unique ID for {table_name}. "
            f"All IDs in range {min_val}-{max_val} have been used."
        )

    def _generate_correlated_id(self, parent_table: str) -> Union[int, str]:
        """Generate a correlated ID from a parent table."""
        if not self._generated_ids.get(parent_table):
            raise ValueError(f"No IDs available for parent table {parent_table}")
        # Get the raw ID without prefix
        parent_ids = [
            int(id_val.split('-')[-1]) if isinstance(id_val, str) else id_val
            for id_val in self._generated_ids[parent_table]
        ]
        return np.random.choice(parent_ids)

    def _extract_parent_table(self, col_name: str) -> str:
        """Extract parent table name from column name."""
        # Handle special cases first
        if col_name == "policy_id":
            return "policies"
        if col_name == "customer_id":
            return "customers"
        if col_name == "claim_id":
            return "claims"

        # General case: remove '_id' suffix
        if col_name.endswith("_id"):
            table_name = col_name[:-3]
            # Handle pluralization
            if not table_name.endswith('s'):
                table_name += 's'
            return table_name
        raise ValueError(f"Invalid column name for parent table extraction: {col_name}")

    def _clear_generated_ids(self):
        """Clear all generated IDs."""
        self._generated_ids = {}
        self._id_counters = {}

    async def generate_synthetic_data(
        self,
        table_name: str,
        schema: Dict[str, Dict[str, Any]],
        rows: int
    ) -> Dict[str, List[Any]]:
        """Generate synthetic data for a table."""
        data: Dict[str, List[Any]] = {}

        # Generate data for each column
        for col_name, col_spec in schema.items():
            generator = col_spec.get("generator", "numpy")

            if generator == "faker":
                # Handle legacy faker.method format
                if "." in col_spec.get("type", ""):
                    method_name = col_spec["type"].split(".")[-1]
                else:
                    method_name = self._map_faker_type(col_spec.get("type", "text"))

                values = []
                for _ in range(rows):
                    value = self._generate_faker_value(method_name)
                    # Convert date objects to string format
                    if isinstance(value, (datetime.date, datetime.datetime)):
                        value = value.isoformat()
                    values.append(value)
                data[col_name] = values

            elif generator == "mimesis":
                data[col_name] = [self._generate_mimesis_value(col_spec["type"]) for _ in range(rows)]

            elif generator == "numpy":
                if col_spec["type"] == "boolean":
                    data[col_name] = [bool(x) for x in np.random.choice([True, False], size=rows)]
                elif "correlated" in col_spec and col_spec["correlated"]:
                    parent_table = self._extract_parent_table(col_name)
                    if not self._generated_ids.get(parent_table):
                        raise ValueError(f"Parent table {parent_table} must be generated before {table_name}")
                    data[col_name] = [
                        self._generate_correlated_id(parent_table)
                        for _ in range(rows)
                    ]
                elif col_spec["type"] in ["integer", "int"]:
                    if col_name.endswith("_id"):
                        # Generate unique IDs
                        data[col_name] = []
                        for _ in range(rows):
                            id_val = self._generate_unique_id(table_name, col_spec)
                            # Add prefix if specified
                            if "prefix" in col_spec:
                                id_val = f"{col_spec['prefix']}{id_val}"
                            data[col_name].append(id_val)
                            # Store raw ID for relationships
                            if isinstance(id_val, str) and "-" in id_val:
                                raw_id = int(id_val.split("-")[-1])
                                if table_name not in self._generated_ids:
                                    self._generated_ids[table_name] = set()
                                self._generated_ids[table_name].add(raw_id)
                            else:
                                if table_name not in self._generated_ids:
                                    self._generated_ids[table_name] = set()
                                self._generated_ids[table_name].add(id_val)
                    else:
                        # Regular integer values
                        min_val = col_spec.get("min", 0)
                        max_val = col_spec.get("max", 100)
                        data[col_name] = [
                            int(x) for x in np.random.randint(min_val, max_val + 1, size=rows)
                        ]
                elif col_spec["type"] == "float":
                    min_val = float(col_spec.get("min", 0.0))
                    max_val = float(col_spec.get("max", 1.0))
                    data[col_name] = [
                        float(x) for x in np.random.uniform(min_val, max_val, size=rows)
                    ]
                elif col_spec["type"] == "category":
                    categories = col_spec.get("categories", [])
                    data[col_name] = list(np.random.choice(categories, size=rows))
                elif col_spec["type"] == "string" and "categories" in col_spec:
                    categories = col_spec.get("categories", [])
                    data[col_name] = list(np.random.choice(categories, size=rows))
                else:
                    # Default to string type
                    data[col_name] = [str(x) for x in range(rows)]

        # Convert all numpy types to native Python types for JSON serialization
        for col_name in data:
            if isinstance(data[col_name], np.ndarray):
                data[col_name] = data[col_name].tolist()
            data[col_name] = [
                int(x) if isinstance(x, np.integer)
                else float(x) if isinstance(x, np.floating)
                else bool(x) if isinstance(x, np.bool_)
                else str(x) if isinstance(x, np.str_)
                else x
                for x in data[col_name]
            ]

        return data
