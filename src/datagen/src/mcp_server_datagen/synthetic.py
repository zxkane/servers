"""Synthetic data generation using SDV."""

from typing import Dict, List, Any, Set, Union
import pandas as pd
import numpy as np
from faker import Faker
from mimesis import Generic
from sdv.single_table import GaussianCopulaSynthesizer
from sdv.metadata import SingleTableMetadata
from datetime import datetime, timedelta


class SyntheticDataGenerator:
    """Handles synthetic data generation using SDV."""

    def __init__(self):
        """Initialize the synthetic data generator."""
        self.synthesizers: Dict[str, GaussianCopulaSynthesizer] = {}
        self.metadata: Dict[str, SingleTableMetadata] = {}
        self.faker = Faker()
        self.mimesis = Generic()
        # Store generated IDs for relationships
        self._generated_ids: Dict[str, Set[Union[int, str]]] = {
            "customers": set(),
            "policies": set(),
            "claims": set()
        }
        self.default_schemas: Dict[str, Dict[str, Dict[str, Any]]] = {}
        # Counter for ID generation
        self.id_counters: Dict[str, int] = {}

    def create_metadata(
        self,
        table_name: str,
        schema: Dict[str, Dict[str, Any]]
    ) -> SingleTableMetadata:
        """Create metadata for a table based on schema."""
        metadata = SingleTableMetadata()

        for col_name, col_spec in schema.items():
            data_type = col_spec.get("type", "string")
            sdtype = self._map_type_to_sdtype(data_type)
            metadata.add_column(
                column_name=col_name,
                sdtype=sdtype
            )

        return metadata

    def _map_type_to_sdtype(self, data_type: str) -> str:
        """Map data type to SDV type."""
        type_mapping = {
            "string": "categorical",
            "int": "numerical",
            "integer": "numerical",
            "float": "numerical",
            "datetime": "datetime",
            "boolean": "boolean",
            "category": "categorical"
        }
        return type_mapping.get(data_type, "categorical")

    def _map_faker_type(self, data_type: str) -> str:
        """Map data type to Faker method name."""
        # Handle legacy faker.method format
        if "." in data_type:
            return data_type.split(".")[-1]

        # Direct mapping for faker types
        if data_type in {
            "first_name", "last_name", "email", "phone_number",
            "address", "text", "date_this_year", "date_this_decade",
            "date_of_birth", "name"
        }:
            return data_type

        # Legacy type mapping
        type_mapping = {
            "string": "text",
        }
        return type_mapping.get(data_type, "text")

    def _generate_faker_value(self, faker_type: str) -> str:
        """Generate a value using Faker."""
        # Handle legacy faker.method format
        if "." in faker_type:
            faker_type = faker_type.split(".")[-1]

        # Get the faker method
        method = getattr(self.faker, faker_type, None)
        if method is None:
            # Fallback to text() if method not found
            return self.faker.text()

        return method()

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

    def _generate_unique_id(self, table_name: str, col_spec: Dict[str, Any]) -> Union[int, str]:
        """Generate a unique ID for a table."""
        min_val = col_spec.get("min", 1000)
        max_val = col_spec.get("max", 9999)

        # Initialize ID storage if needed
        if table_name not in self._generated_ids:
            self._generated_ids[table_name] = set()

        # Calculate available range
        used_count = len(self._generated_ids[table_name])
        available_range = max_val - min_val + 1

        # Check if we've exhausted the range
        if used_count >= available_range:
            raise ValueError(
                f"Cannot generate unique ID for table {table_name}: "
                f"All values in range {min_val}-{max_val} have been used"
            )

        # Generate a unique ID
        while True:
            # Generate base ID
            base_id = int(np.random.randint(min_val, max_val + 1))

            # Format ID with prefix if specified
            formatted_id = f"{col_spec['prefix']}{base_id:04d}" if "prefix" in col_spec else base_id

            # Check if ID is unique and add to set
            if formatted_id not in self._generated_ids[table_name]:
                self._generated_ids[table_name].add(formatted_id)
                return formatted_id

    def _generate_correlated_id(self, parent_table: str) -> Union[int, str]:
        """Generate a correlated ID from a parent table."""
        if not self._generated_ids.get(parent_table):
            raise ValueError(f"No IDs available for parent table {parent_table}")
        return np.random.choice(list(self._generated_ids[parent_table]))

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

    async def fit_synthesizer(
        self,
        table_name: str,
        schema: Dict[str, Dict[str, Any]]
    ) -> None:
        """Fit a synthesizer for the given table schema."""
        metadata = self.create_metadata(table_name, schema)
        fitting_size = min(100, 1000)  # Use a small sample size for fitting

        # Generate sample data for fitting
        sample_data = {}
        for col_name, col_spec in schema.items():
            col_type = col_spec["type"]
            is_correlated = col_spec.get("correlated", False)

            if is_correlated and col_name.endswith("_id"):
                # For correlated fields, use IDs from parent table
                parent_table = self._extract_parent_table(col_name)
                if parent_table not in self._generated_ids:
                    raise ValueError(f"Parent table {parent_table} must be generated before {table_name}")
                parent_ids = list(self._generated_ids[parent_table])
                sample_data[col_name] = [
                    np.random.choice(parent_ids) for _ in range(fitting_size)
                ]
            elif col_type == "int":
                min_val = col_spec.get("min", 0)
                max_val = col_spec.get("max", 100)
                if col_name.endswith("_id"):
                    # Generate unique IDs for primary keys
                    unique_ids = set()
                    while len(unique_ids) < fitting_size:
                        unique_ids.add(self._generate_unique_id(table_name, col_spec))
                    sample_data[col_name] = list(unique_ids)
                else:
                    sample_data[col_name] = [
                        np.random.randint(min_val, max_val + 1)
                        for _ in range(fitting_size)
                    ]
            elif col_type == "float":
                min_val = col_spec.get("min", 0.0)
                max_val = col_spec.get("max", 1.0)
                sample_data[col_name] = [
                    np.random.uniform(min_val, max_val)
                    for _ in range(fitting_size)
                ]
            elif col_type == "category":
                categories = col_spec.get("categories", [])
                sample_data[col_name] = [
                    np.random.choice(categories)
                    for _ in range(fitting_size)
                ]
            elif col_type == "datetime":
                if "generator" in col_spec:
                    generator_str = col_spec["generator"]
                    if generator_str.startswith("faker."):
                        sample_data[col_name] = [
                            self._generate_faker_value(generator_str.split(".", 1)[1])
                            for _ in range(fitting_size)
                        ]
                    elif generator_str.startswith("mimesis."):
                        sample_data[col_name] = [
                            self._generate_mimesis_value(generator_str)
                            for _ in range(fitting_size)
                        ]
                else:
                    # Default to current year's range
                    current_year = datetime.now().year
                    start = datetime(current_year, 1, 1)
                    end = datetime(current_year, 12, 31)
                    sample_data[col_name] = [
                        start + timedelta(
                            seconds=np.random.randint(0, int((end - start).total_seconds()))
                        )
                        for _ in range(fitting_size)
                    ]
            elif col_type == "string":
                if "generator" in col_spec:
                    generator_str = col_spec["generator"]
                    if generator_str == "faker":
                        sample_data[col_name] = [
                            self._generate_faker_value(col_spec.get("type", "string"))
                            for _ in range(fitting_size)
                        ]
                    elif generator_str.startswith("faker."):
                        sample_data[col_name] = [
                            self._generate_faker_value(generator_str.split(".", 1)[1])
                            for _ in range(fitting_size)
                        ]
                    elif generator_str.startswith("mimesis."):
                        sample_data[col_name] = [
                            self._generate_mimesis_value(generator_str)
                            for _ in range(fitting_size)
                        ]
                else:
                    # Default to random string
                    sample_data[col_name] = [
                        ''.join(np.random.choice(list('abcdefghijklmnopqrstuvwxyz'), size=10))
                        for _ in range(fitting_size)
                    ]

        # Create DataFrame and fit synthesizer
        df = pd.DataFrame(sample_data)
        synthesizer = GaussianCopulaSynthesizer(metadata)
        synthesizer.fit(df)
        self.synthesizers[table_name] = synthesizer

    async def generate_synthetic_data(
        self,
        table_name: str,
        schema: Dict[str, Dict[str, Any]],
        rows: int = 1000
    ) -> Dict[str, List[Any]]:
        """Generate synthetic data for a table."""
        # Initialize result dictionary with empty lists for all columns
        result: Dict[str, List[Any]] = {col_name: [] for col_name in schema.keys()}

        # Generate parent tables first if needed
        parent_tables = set()
        for col_name, col_spec in schema.items():
            if col_spec.get("correlated", False):
                parent_table = self._extract_parent_table(col_name)
                parent_tables.add((parent_table, col_name))

        # Generate parent table data if not already generated
        for parent_table, col_name in parent_tables:
            if parent_table not in self._generated_ids or not self._generated_ids[parent_table]:
                if hasattr(self, 'default_schemas') and parent_table in self.default_schemas:
                    parent_schema = self.default_schemas[parent_table]
                    await self.generate_synthetic_data(parent_table, parent_schema, rows)
                else:
                    raise ValueError(f"Parent table {parent_table} schema not found")

        # Generate data for each column
        for _ in range(rows):
            for col_name, col_spec in schema.items():
                col_type = col_spec["type"]
                value = None

                if col_name.endswith("_id") and not col_spec.get("correlated", False):
                    # Generate unique ID
                    base_value = self._generate_unique_id(table_name, col_spec)
                    # Apply prefix if specified
                    if "prefix" in col_spec and isinstance(base_value, int):
                        value = f"{col_spec['prefix']}{base_value:04d}"
                    else:
                        value = base_value
                elif col_spec.get("correlated", False):
                    # Generate correlated ID from parent table
                    parent_table = self._extract_parent_table(col_name)
                    base_value = self._generate_correlated_id(parent_table)
                    # Apply prefix if specified in parent schema
                    if "prefix" in schema[col_name] and isinstance(base_value, int):
                        value = f"{schema[col_name]['prefix']}{base_value:04d}"
                    else:
                        value = base_value
                elif col_spec.get("generator") == "faker":
                    # Handle faker generator with type or faker_type
                    faker_type = col_spec.get("faker_type", col_type)
                    value = self._generate_faker_value(faker_type)
                elif col_type in ("int", "integer"):
                    min_val = col_spec.get("min", 0)
                    max_val = col_spec.get("max", 100)
                    value = int(np.random.randint(min_val, max_val + 1))
                elif col_type == "float":
                    value = np.random.uniform(col_spec.get("min", 0.0), col_spec.get("max", 1.0))
                elif col_type == "datetime":
                    if "generator" in col_spec:
                        value = self._generate_faker_value(col_spec["generator"])
                    else:
                        value = self._generate_faker_value("date_time_this_decade")
                elif col_type == "category":
                    value = np.random.choice(col_spec["categories"])
                elif col_type == "boolean":
                    value = bool(np.random.choice([True, False]))
                elif col_type == "string":
                    # Handle string type with categories or generator
                    if "categories" in col_spec:
                        value = np.random.choice(col_spec["categories"])
                    elif "generator" in col_spec:
                        if col_spec["generator"] == "faker":
                            value = self._generate_faker_value(col_spec.get("faker_type", "text"))
                        elif col_spec["generator"] == "mimesis":
                            value = self._generate_mimesis_value(col_spec.get("mimesis_type", "text"))
                        elif "." in col_spec["generator"]:
                            # Handle legacy faker.method format
                            value = self._generate_faker_value(col_spec["generator"])
                    else:
                        value = self._generate_faker_value("text")

                result[col_name].append(value)

        # Store generated IDs for correlated columns
        for col_name, values in result.items():
            if col_name.endswith("_id") and not schema[col_name].get("correlated", False):
                if table_name not in self._generated_ids:
                    self._generated_ids[table_name] = set()
                self._generated_ids[table_name].update(values)

        return result
