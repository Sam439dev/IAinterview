"""
Request Detection Service
Detects questions, commands, and requests in transcribed text.
"""
from config import CONFIDENCE_THRESHOLD


# Patterns that are definitely small talk (not requests)
SMALL_TALK_PATTERNS = {
    "bonjour", "bonsoir", "hello", "hi", "hey", "salut", 
    "merci", "thanks", "ok", "okay", "oui", "non", "yes", "no",
    "d'accord", "parfait", "super", "bien", "excellent"
}

# Reflexive commands (single words that are commands)
REFLEXIVE_COMMANDS = {
    "présentez-vous", "presentez-vous", 
    "décrivez-vous", "expliquez-vous"
}

# Question starters
QUESTION_STARTERS = [
    "what", "why", "how", "when", "where", "who", "which", "what's", "what is",
    "qu'est-ce", "qu'est ce", "pourquoi", "comment", "quand", "où", "qui", 
    "quel", "quelle", "quels", "quelles", "combien"
]

# French imperatives
FRENCH_IMPERATIVES = [
    "parlez", "parle", "dites", "dis", "décrivez", "décris",
    "présentez", "présente", "expliquez", "explique",
    "racontez", "raconte", "donnez", "donne", "montrez", "montre",
    "citez", "cite", "détaillez", "détaille", "développez", "développe",
    "précisez", "précise", "illustrez", "illustre"
]

# English imperatives
ENGLISH_IMPERATIVES = [
    "tell me", "tell us", "describe", "explain", "share", 
    "give me", "give us", "show me", "show us",
    "walk me", "walk us", "take me", "take us",
    "elaborate", "discuss", "outline", "summarize", "present",
    "go through", "talk about", "speak about", "mention"
]

# French polite requests
FRENCH_POLITE = [
    "pouvez-vous", "pouvez vous", "pourriez-vous", "pourriez vous",
    "est-ce que", "est ce que", "j'aimerais", "je voudrais",
    "serait-il possible", "auriez-vous"
]

# English polite requests
ENGLISH_POLITE = [
    "could you", "can you", "would you", "will you",
    "i'd like", "i would like", "i want to know",
    "please tell", "please explain", "please describe",
    "do you have", "have you"
]

# Invitations to speak
INVITATIONS = [
    "go ahead", "continue", "go on", "please continue",
    "allez-y", "continuez", "développez", "approfondissez",
    "à vous", "c'est à vous", "votre tour"
]

# Topic markers
TOPIC_MARKERS = [
    "about your", "concerning your", "regarding your",
    "à propos de", "concernant votre", "au sujet de",
    "parlons de", "abordons", "venons-en à"
]

# Experience patterns
EXPERIENCE_PATTERNS = [
    "your experience", "votre expérience", "votre parcours",
    "your background", "your skills", "vos compétences",
    "avez-vous", "have you ever", "did you"
]


def detect_request(text: str) -> bool:
    """
    Detect if the text is a request requiring a response.
    Detects ALL types: questions, imperatives, invitations to elaborate.
    
    Target: >90% detection rate.
    """
    lowered = text.lower().strip()
    words = lowered.split()
    
    # Check reflexive commands first (single words)
    if lowered.rstrip("!.,?") in REFLEXIVE_COMMANDS:
        return True
    
    # Very short = likely noise (but allow questions)
    if len(words) < 2 and "?" not in text:
        return False
    
    # Quick whitelist check for common greetings ONLY
    if lowered.rstrip("!.,?") in SMALL_TALK_PATTERNS and "?" not in text:
        return False
    
    # === HIGH-PRIORITY DETECTION ===
    
    # 1. Direct questions
    if "?" in text:
        return True
    
    # 2. Question words at start
    for starter in QUESTION_STARTERS:
        if lowered.startswith(starter):
            return True
    
    # 3. French imperatives
    for imp in FRENCH_IMPERATIVES:
        if imp in lowered:
            return True
    
    # 4. English imperatives
    for imp in ENGLISH_IMPERATIVES:
        if imp in lowered:
            return True
    
    # 5. French polite requests
    for pol in FRENCH_POLITE:
        if pol in lowered:
            return True
    
    # 6. English polite requests
    for pol in ENGLISH_POLITE:
        if pol in lowered:
            return True
    
    # 7. Invitations to speak
    for inv in INVITATIONS:
        if inv in lowered:
            return True
    
    # 8. Topic markers
    for marker in TOPIC_MARKERS:
        if marker in lowered:
            return True
    
    # 9. Experience patterns
    for pattern in EXPERIENCE_PATTERNS:
        if pattern in lowered:
            return True
    
    return False


def calculate_confidence(text: str) -> float:
    """
    Calculate confidence score for a detected request (0.0 to 1.0).
    """
    lowered = text.lower().strip()
    confidence = 0.0
    
    # Question mark = high confidence
    if "?" in text:
        confidence += 0.8
    
    # Question words
    question_words = ["what", "why", "how", "when", "where", "who", "which",
                      "qu'est-ce", "pourquoi", "comment", "quand", "où", "qui", "quel", "combien"]
    for word in question_words:
        if lowered.startswith(word) or f" {word} " in lowered:
            confidence += 0.4
            break
    
    # Imperative verbs (high confidence)
    imperatives = [
        "parlez", "dites", "décrivez", "présentez", "expliquez", "racontez",
        "tell me", "describe", "explain", "share", "walk me", "give me"
    ]
    for imp in imperatives:
        if imp in lowered:
            confidence += 0.7
            break
    
    # Polite request markers
    polite = ["pouvez", "pourriez", "could you", "can you", "would you", "please"]
    for pol in polite:
        if pol in lowered:
            confidence += 0.5
            break
    
    # Length bonus (longer = more likely a real request)
    words = len(lowered.split())
    if words >= 4:
        confidence += 0.15
    if words >= 8:
        confidence += 0.15
    
    return min(confidence, 1.0)


def is_request_above_threshold(text: str) -> bool:
    """Check if text is a request with confidence above threshold."""
    if not detect_request(text):
        return False
    return calculate_confidence(text) >= CONFIDENCE_THRESHOLD


def estimate_speaker(text: str, is_request: bool) -> str:
    """Simple speaker estimation without ML-based diarization."""
    if is_request:
        return "interviewer"
    return "candidate"
