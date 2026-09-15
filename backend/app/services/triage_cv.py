import numpy as np
from PIL import Image
import io
import logging

logger = logging.getLogger("pulseguard.triage_cv")

class PreliminaryVisionTriageEngine:
    """
    Automated computer vision triage engine for preliminary patient photos.
    Evaluates wound/trauma severity, tissue discoloration (cyanosis, pallor, erythema),
    and assigns clinical START & ESI emergency scores.
    """

    @staticmethod
    def analyze_photo(photo_bytes: bytes, capture_modality: str = "wound") -> dict:
        try:
            image = Image.open(io.BytesIO(photo_bytes)).convert("RGB")
            # Downsample if ultra-large for fast analysis
            image.thumbnail((800, 800))
            img_np = np.array(image, dtype=np.float32)

            r = img_np[:, :, 0]
            g = img_np[:, :, 1]
            b = img_np[:, :, 2]

            # 1. Erythema / Hemorrhage Index (High Redness relative to Green/Blue)
            rg_diff = r - g
            rb_diff = r - b
            active_red_mask = (rg_diff > 45) & (rb_diff > 45)
            red_ratio = float(np.sum(active_red_mask) / (img_np.shape[0] * img_np.shape[1]))

            # 2. Cyanosis / Hypoxia Index (Elevated Blue/Violet tint on skin)
            cyan_mask = (b > r) & (b > 80)
            cyan_ratio = float(np.sum(cyan_mask) / (img_np.shape[0] * img_np.shape[1]))

            # 3. Pallor / Shock Index (Low overall saturation, washed out tone)
            mean_intensity = float(np.mean(img_np))
            saturation = float(np.mean(np.max(img_np, axis=2) - np.min(img_np, axis=2)))

            # Detect tags
            detected_tags = []
            if red_ratio > 0.08:
                detected_tags.append("active_bleeding_or_burn")
            elif red_ratio > 0.03:
                detected_tags.append("tissue_erythema_or_abrasion")

            if cyan_ratio > 0.05:
                detected_tags.append("cyanosis_suspected")

            if saturation < 25.0 and mean_intensity > 130:
                detected_tags.append("dermal_pallor_hypoperfusion")

            if not detected_tags:
                detected_tags.append("localized_soft_tissue_injury")

            # 4. START and ESI Scoring Logic
            if "active_bleeding_or_burn" in detected_tags or "cyanosis_suspected" in detected_tags:
                triage_color = "RED"
                esi_level = 1 if ("cyanosis_suspected" in detected_tags and red_ratio > 0.12) else 2
                confidence = 0.92
            elif "tissue_erythema_or_abrasion" in detected_tags or "dermal_pallor_hypoperfusion" in detected_tags:
                triage_color = "YELLOW"
                esi_level = 3
                confidence = 0.88
            else:
                triage_color = "GREEN"
                esi_level = 4
                confidence = 0.85

            return {
                "triage_color": triage_color,
                "esi_level": esi_level,
                "confidence": confidence,
                "detected_tags": detected_tags,
                "metrics": {
                    "hemorrhage_ratio": round(red_ratio, 4),
                    "cyanosis_ratio": round(cyan_ratio, 4),
                    "mean_saturation": round(saturation, 2)
                }
            }

        except Exception as e:
            logger.error(f"Error analyzing photo: {e}")
            return {
                "triage_color": "YELLOW",
                "esi_level": 3,
                "confidence": 0.50,
                "detected_tags": ["unclassified_trauma"],
                "metrics": {}
            }
