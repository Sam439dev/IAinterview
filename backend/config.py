"""
Application Configuration
Centralized configuration and constants for the Interview Copilot.
"""
import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

# ========== DATABASE ==========
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "interview_copilot")

# ========== API CONFIGURATION ==========
DEEPSEEK_BASE_URL = "https://api.deepseek.com/v1"
SUPPORTED_LLM_PROVIDERS = {"openai", "anthropic", "gemini", "deepseek"}

# ========== AUDIO CONFIGURATION ==========
AUDIO_BUFFER_SECONDS = int(os.environ.get("AUDIO_BUFFER_SECONDS", "3"))
TRANSCRIBE_INTERVAL = float(os.environ.get("TRANSCRIBE_INTERVAL", "1.0"))

# ========== LLM LIMITS ==========
MAX_CONCURRENT_SUGGESTIONS = 3
REQUEST_SIMILARITY_THRESHOLD = 0.85
DEFAULT_MAX_TOKENS = 200
DEFAULT_TEMPERATURE = 0.3
DEFAULT_TIMEOUT = 15.0

# ========== MEMORY LIMITS ==========
MAX_SESSIONS = 10
CONVERSATION_MEMORY_LIMIT = 50
CV_CACHE_TTL_SECONDS = 60
CONTEXT_CACHE_TTL_SECONDS = 30

# ========== DETECTION THRESHOLDS ==========
CONFIDENCE_THRESHOLD = 0.3

# ========== PATHS ==========
BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
PROMPT_TEMPLATES_PATH = DATA_DIR / "prompt_templates.json"

# ========== DATE PARSING ==========
MONTH_MAP = {
    'janvier': 1, 'jan': 1, 'january': 1,
    'février': 2, 'fev': 2, 'feb': 2, 'february': 2,
    'mars': 3, 'mar': 3, 'march': 3,
    'avril': 4, 'avr': 4, 'apr': 4, 'april': 4,
    'mai': 5, 'may': 5,
    'juin': 6, 'jun': 6, 'june': 6,
    'juillet': 7, 'jul': 7, 'july': 7,
    'août': 8, 'aou': 8, 'aug': 8, 'august': 8,
    'septembre': 9, 'sep': 9, 'sept': 9, 'september': 9,
    'octobre': 10, 'oct': 10, 'october': 10,
    'novembre': 11, 'nov': 11, 'november': 11,
    'décembre': 12, 'dec': 12, 'december': 12,
}

DATE_PATTERNS = [
    (r'(\w+)\s*(\d{4})\s*[-–]\s*(\w+)\s*(\d{4})', 'month_year_range'),
    (r'(\d{4})\s*[-–]\s*(\d{4})', 'year_range'),
    (r'depuis\s+(?:(\w+)\s+)?(\d{4})', 'since'),
    (r'(\d{1,2})/(\d{4})\s*[-–]\s*(?:(\d{1,2})/(\d{4})|présent|actuel|aujourd\'?hui|current)', 'mm_yyyy_range'),
    (r'(\d{4})\s*[-–à]\s*(?:présent|actuel|aujourd\'?hui|current)', 'year_to_present'),
    (r'\b(\d{4})\b', 'single_year'),
]
