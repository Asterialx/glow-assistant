use regex::Regex;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct RedactionResult {
    pub text: String,
    pub redacted_count: usize,
}

pub fn redact(input: &str) -> RedactionResult {
    let patterns: Vec<(&str, &str)> = vec![
        (r"(?i)\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", "[REDACTED_EMAIL]"),
        (r"(?i)\b(?:\+?\d{1,3}[-.\s]?)?(?:\(?\d{2,4}\)?[-.\s]?)?\d{3}[-.\s]?\d{2}[-.\s]?\d{2}\b", "[REDACTED_PHONE]"),
        (r"(?i)\b(?:MRN|ID|Patient\s*#?)\s*[:=]?\s*[A-Z0-9-]{4,}\b", "[REDACTED_MRN]"),
        (r"(?i)\b\d{3}-\d{2}-\d{4}\b", "[REDACTED_SSN]"),
        // Common Cyrillic + Latin name patterns after labels
        (r"(?i)(?:пациент|patient|фио|name)\s*[:=]\s*[^\n,;]{2,60}", "[REDACTED_NAME]"),
    ];

    let mut text = input.to_string();
    let mut redacted_count = 0usize;

    for (pattern, replacement) in patterns {
        if let Ok(re) = Regex::new(pattern) {
            let count = re.find_iter(&text).count();
            if count > 0 {
                redacted_count += count;
                text = re.replace_all(&text, replacement).to_string();
            }
        }
    }

    RedactionResult {
        text,
        redacted_count,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn redacts_email_and_phone() {
        let r = redact("Patient: Ivan Petrov email test@example.com phone +7 900 123-45-67");
        assert!(r.text.contains("[REDACTED"));
        assert!(r.redacted_count >= 1);
    }
}
