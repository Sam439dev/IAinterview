"""
Chronology Service
Date parsing and experience sorting by chronological order.
"""
import re
from datetime import datetime
from typing import Dict, List, Optional, Tuple

from config import MONTH_MAP, DATE_PATTERNS


def parse_date_string(date_str: str) -> Tuple[Optional[datetime], Optional[datetime], bool]:
    """
    Parse a date string and return (start_date, end_date, is_current).
    Returns (None, None, False) if not parseable.
    
    Supported formats:
    - "janvier 2020 - décembre 2023"
    - "2020-2023"
    - "depuis 2020"
    - "01/2020 - 12/2023"
    - "2020 - présent"
    """
    if not date_str:
        return None, None, False
    
    date_str_lower = date_str.lower().strip()
    current_year = datetime.now().year
    current_month = datetime.now().month
    
    # Detect "current" indicators
    is_current = any(word in date_str_lower for word in 
                     ['présent', 'actuel', "aujourd'hui", 'current', 'ongoing'])
    
    for pattern, pattern_type in DATE_PATTERNS:
        match = re.search(pattern, date_str_lower)
        if not match:
            continue
            
        try:
            if pattern_type == 'month_year_range':
                start_month = MONTH_MAP.get(match.group(1), 1)
                start_year = int(match.group(2))
                end_month = MONTH_MAP.get(match.group(3), 12)
                end_year = int(match.group(4))
                return (
                    datetime(start_year, start_month, 1),
                    datetime(end_year, end_month, 28),
                    False
                )
            
            elif pattern_type == 'year_range':
                start_year = int(match.group(1))
                end_year = int(match.group(2))
                return (
                    datetime(start_year, 1, 1),
                    datetime(end_year, 12, 31),
                    False
                )
            
            elif pattern_type == 'since':
                month = MONTH_MAP.get(match.group(1), 1) if match.group(1) else 1
                year = int(match.group(2))
                return (
                    datetime(year, month, 1),
                    datetime(current_year, current_month, 28),
                    True
                )
            
            elif pattern_type == 'mm_yyyy_range':
                start_month = int(match.group(1))
                start_year = int(match.group(2))
                if match.group(3) and match.group(4):
                    end_month = int(match.group(3))
                    end_year = int(match.group(4))
                    is_current = False
                else:
                    end_month = current_month
                    end_year = current_year
                    is_current = True
                return (
                    datetime(start_year, start_month, 1),
                    datetime(end_year, end_month, 28),
                    is_current
                )
            
            elif pattern_type == 'year_to_present':
                start_year = int(match.group(1))
                return (
                    datetime(start_year, 1, 1),
                    datetime(current_year, current_month, 28),
                    True
                )
            
            elif pattern_type == 'single_year':
                year = int(match.group(1))
                return (
                    datetime(year, 1, 1),
                    datetime(year, 12, 31),
                    False
                )
        except (ValueError, IndexError):
            continue
    
    return None, None, is_current


def sort_experiences_chronologically(experiences: List[Dict], reverse: bool = True) -> List[Dict]:
    """
    Sort experiences by date (most recent first by default).
    Adds parsed date metadata to each experience.
    """
    if not experiences:
        return []
    
    parsed_experiences = []
    
    for exp in experiences:
        duration = exp.get('duration', '') or exp.get('period', '') or ''
        start_date, end_date, is_current = parse_date_string(duration)
        
        # Enrich experience with parsed dates
        exp_copy = exp.copy()
        exp_copy['_parsed_start_date'] = start_date.isoformat() if start_date else None
        exp_copy['_parsed_end_date'] = end_date.isoformat() if end_date else None
        exp_copy['_is_current'] = is_current
        exp_copy['_has_complete_dates'] = start_date is not None
        
        # Sort key: end date (or current date if ongoing, or 1900 if unknown)
        if is_current:
            sort_key = datetime.now()
        elif end_date:
            sort_key = end_date
        elif start_date:
            sort_key = start_date
        else:
            sort_key = datetime(1900, 1, 1)  # Experiences without dates at the end
        
        exp_copy['_sort_key'] = sort_key
        parsed_experiences.append(exp_copy)
    
    # Chronological sort
    sorted_exps = sorted(parsed_experiences, key=lambda x: x['_sort_key'], reverse=reverse)
    
    return sorted_exps


def calculate_experience_freshness(experience: Dict) -> float:
    """
    Calculate a "freshness" score for an experience (0.0 to 1.0).
    More recent = higher score.
    """
    duration = experience.get('duration', '')
    start_date, end_date, is_current = parse_date_string(duration)
    
    if is_current:
        return 1.0
    
    if end_date:
        years_ago = (datetime.now() - end_date).days / 365.25
        # Decreasing score: 1.0 for this year, decreases by 0.1 per year
        freshness = max(0.0, 1.0 - (years_ago * 0.1))
        return round(freshness, 2)
    
    return 0.5  # Average score for experiences without dates


def get_missing_date_experiences(experiences: List[Dict]) -> List[Dict]:
    """Identify experiences with missing or incomplete dates."""
    missing = []
    for exp in experiences:
        duration = exp.get('duration', '')
        start_date, end_date, _ = parse_date_string(duration)
        
        if not start_date or not end_date:
            missing.append({
                'title': exp.get('title', 'Poste non spécifié'),
                'company': exp.get('company', 'Entreprise non spécifiée'),
                'duration': duration,
                'issue': 'date_incomplete' if start_date or end_date else 'date_missing'
            })
    
    return missing
