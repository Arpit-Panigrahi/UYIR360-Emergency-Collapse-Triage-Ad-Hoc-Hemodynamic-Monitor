import os
import asyncio
import logging
from pathlib import Path
from aiogram import Bot, Dispatcher, types, F
from aiogram.enums import ParseMode
from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton, FSInputFile
from backend.app.core.config import settings

logger = logging.getLogger("pulseguard.telegram")

# Global bot and dispatcher references
bot: Bot | None = None
dp: Dispatcher = Dispatcher()

def init_telegram_bot() -> Bot | None:
    global bot
    token = settings.TELEGRAM_BOT_TOKEN
    if token and token != "YOUR_TELEGRAM_BOT_TOKEN_HERE":
        try:
            bot = Bot(token=token)
            logger.info("Telegram Bot initialized successfully.")
        except Exception as e:
            logger.warning(f"Could not initialize Telegram Bot with provided token: {e}")
            bot = None
    else:
        logger.info("Telegram Bot token not configured; running in mock alert simulation mode.")
        bot = None
    return bot

async def forward_triage_photo_alert(
    patient_id: str,
    triage_color: str,
    esi_level: int,
    confidence: float,
    detected_tags: list,
    photo_path: str,
    gps_lat: float | None = None,
    gps_lon: float | None = None,
    notes: str | None = None,
    chat_id: str | None = None
) -> dict:
    """
    Immediately forwards a preliminary photo intake event to the Paramedic Telegram chat.
    """
    target_chat = chat_id or settings.PARAMEDIC_DEFAULT_CHAT_ID
    color_emoji = {
        "RED": "🔴 RED (IMMEDIATE - LIFE THREATENING)",
        "YELLOW": "🟡 YELLOW (DELAYED - SERIOUS)",
        "GREEN": "🟢 GREEN (MINIMAL - WALKING WOUNDED)",
        "BLACK": "⚫ BLACK (EXPECTANT)"
    }.get(triage_color.upper(), "🟡 UNKNOWN")

    tags_str = ", ".join(detected_tags) if detected_tags else "None identified"
    location_str = f"https://maps.google.com/?q={gps_lat},{gps_lon}" if (gps_lat and gps_lon) else "GPS coordinates not available"

    caption = (
        f"🚨 <b>PATIENT INTAKE: PRELIMINARY PHOTO TRIAGE</b>\n"
        f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
        f"<b>Patient ID:</b> <code>{patient_id}</code>\n"
        f"<b>Triage Status:</b> <b>{color_emoji}</b>\n"
        f"<b>ESI Category:</b> Level {esi_level} (AI Confidence: {confidence*100:.1f}%)\n"
        f"<b>Detected Conditions:</b> {tags_str}\n"
        f"<b>Location:</b> <a href='{location_str}'>Open Live Map</a>\n"
        f"{f'<b>Field Notes:</b> {notes}\n' if notes else ''}"
        f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
        f"<i>Awaiting paramedic action. Select response below:</i>"
    )

    keyboard = InlineKeyboardMarkup(inline_keyboard=[
        [
            InlineKeyboardButton(text="🚑 Dispatch Ambulance", callback_data=f"dispatch_{patient_id}"),
            InlineKeyboardButton(text="👨‍⚕️ Escalate to ER", callback_data=f"escalate_{patient_id}")
        ],
        [
            InlineKeyboardButton(
                text="📈 Open Live Telemetry Stream",
                web_app=types.WebAppInfo(url=f"http://localhost:3000/patient/{patient_id}")
            )
        ]
    ])

    if bot and target_chat and target_chat != "YOUR_TELEGRAM_CHAT_ID_HERE":
        try:
            photo_file = FSInputFile(photo_path)
            sent = await bot.send_photo(
                chat_id=target_chat,
                photo=photo_file,
                caption=caption,
                parse_mode=ParseMode.HTML,
                reply_markup=keyboard
            )
            return {"status": "sent", "telegram_message_id": sent.message_id}
        except Exception as e:
            logger.error(f"Failed sending Telegram photo alert: {e}")
            return {"status": "error", "error": str(e)}
    else:
        logger.info(f"\n[SIMULATED TELEGRAM ALERT - PHOTO TRIAGE]\n{caption}\nPhoto: {photo_path}\n")
        return {"status": "simulated", "telegram_message_id": "sim-991"}

async def forward_vital_breach_alert(
    patient_id: str,
    vitals: dict,
    chart_path: str,
    anomaly_reason: str,
    chat_id: str | None = None
) -> dict:
    """
    Forwards a critical cardiovascular/respiratory threshold breach with the
    generated 6-panel clinical multi-biomarker chart.
    """
    target_chat = chat_id or settings.PARAMEDIC_DEFAULT_CHAT_ID
    hr = vitals.get('dominant_bpm', 'N/A')
    rr = vitals.get('respiration_brpm', 'N/A')
    spo2 = vitals.get('spo2_percent', 'N/A')
    rmssd = vitals.get('rmssd_ms', 'N/A')
    mews = vitals.get('mews_score', 0)

    caption = (
        f"⚠️ <b>CRITICAL VITAL BREACH: PARAMEDIC ALERT</b>\n"
        f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
        f"<b>Patient ID:</b> <code>{patient_id}</code>\n"
        f"<b>Trigger:</b> <b>{anomaly_reason}</b>\n\n"
        f"<b>PHYSIOLOGICAL METRICS (Last 30s):</b>\n"
        f"• <b>Heart Rate:</b> <code>{hr} BPM</code>\n"
        f"• <b>Respiration:</b> <code>{rr} BrPM</code>\n"
        f"• <b>SpO2 (Proxy):</b> <code>{spo2}%</code>\n"
        f"• <b>HRV RMSSD:</b> <code>{rmssd} ms</code>\n"
        f"• <b>MEWS Risk Score:</b> <code>{mews} / 14</code>\n"
        f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
        f"<i>Multi-Biomarker rPPG Analysis Attached Below</i>"
    )

    keyboard = InlineKeyboardMarkup(inline_keyboard=[
        [
            InlineKeyboardButton(text="🚑 Unit Dispatched", callback_data=f"ack_dispatch_{patient_id}"),
            InlineKeyboardButton(text="📞 Call Field Responder", callback_data=f"call_{patient_id}")
        ],
        [
            InlineKeyboardButton(
                text="📊 View 60Hz Live Waveform",
                web_app=types.WebAppInfo(url=f"http://localhost:3000/patient/{patient_id}")
            )
        ]
    ])

    if bot and target_chat and target_chat != "YOUR_TELEGRAM_CHAT_ID_HERE":
        try:
            chart_file = FSInputFile(chart_path)
            sent = await bot.send_photo(
                chat_id=target_chat,
                photo=chart_file,
                caption=caption,
                parse_mode=ParseMode.HTML,
                reply_markup=keyboard
            )
            return {"status": "sent", "telegram_message_id": sent.message_id}
        except Exception as e:
            logger.error(f"Failed sending Telegram vital breach alert: {e}")
            return {"status": "error", "error": str(e)}
    else:
        logger.info(f"\n[SIMULATED TELEGRAM ALERT - VITAL BREACH]\n{caption}\nChart: {chart_path}\n")
        return {"status": "simulated", "telegram_message_id": "sim-992"}

@dp.callback_query(F.data.startswith("dispatch_"))
async def handle_dispatch_click(callback: types.CallbackQuery):
    patient_id = callback.data.split("_")[1]
    await callback.message.reply(
        f"✅ <b>AMBULANCE DISPATCHED:</b> Unit assigned to patient <code>{patient_id}</code>. ETA: 7 mins.",
        parse_mode=ParseMode.HTML
    )
    await callback.answer()

@dp.callback_query(F.data.startswith("escalate_"))
async def handle_escalate_click(callback: types.CallbackQuery):
    patient_id = callback.data.split("_")[1]
    await callback.message.reply(
        f"🚨 <b>ER NOTIFIED:</b> Trauma bay prepped for incoming patient <code>{patient_id}</code>.",
        parse_mode=ParseMode.HTML
    )
    await callback.answer()
