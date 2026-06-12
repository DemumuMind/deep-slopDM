# This file intentionally contains AI slop patterns for E2E testing.
# Python version - tests lint-external/ruff and ast-slop Python rules.

# Narrative comment: explains step by step
# First we define the configuration dictionary with default settings
# Then we iterate over the input items and filter valid ones
# Finally we return the processed list to the caller

# Console leftover (print debugging)
def process_items(items):
    print(f"Processing items: {items}")
    return [item for item in items if item]

# Empty except - swallowed exception
def load_config():
    try:
        with open("config.json") as f:
            return f.read()
    except:
        pass

# Hardcoded configuration
API_URL = "https://api.example.com/v1"
API_KEY='***'
TIMEOUT_MS = 5000

# Generic name: data, result, info
def process_data(data):
    result = data.get("items", [])
    return result

# Defensive isinstance check
def check_value(value):
    if isinstance(value, str):
        return value
    return str(value)

# TODO stub
# TODO: Implement proper error handling

# Decorative comment
# ===================== HELPER FUNCTIONS =====================

# Trivial comment restating the obvious
# Returns the length of the string
def get_length(s):
    return len(s)

# Duplicate function
def validate_email(email):
    import re
    return bool(re.match(r'^[^\s@]+@[^\s@]+\.[^\s@]+$', email))

def validate_email_again(email):
    import re
    return bool(re.match(r'^[^\s@]+@[^\s@]+\.[^\s@]+$', email))
