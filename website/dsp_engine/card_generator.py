import matplotlib
matplotlib.use('Agg') # Headless non-GUI backend
import matplotlib.pyplot as plt
import numpy as np
from pathlib import Path

def generate_clinical_multibiomarker_card(patient_id: str, analysis: dict, output_path: str, fs: float = 30.0) -> str:
    """
    Renders a high-resolution 6-panel clinical multi-biomarker analysis chart
    matching the validated rPPG research layout, saved to output_path.
    """
    fig, axs = plt.subplots(3, 2, figsize=(16, 14), dpi=130)
    fig.suptitle(
        f"Clinical Photoplethysmography (rPPG) Multi-Biomarker Analysis\nPatient ID: {patient_id}",
        fontsize=16, fontweight='bold', y=0.98
    )
    plt.subplots_adjust(hspace=0.35, wspace=0.25)

    bvp = np.array(analysis.get('filtered_bvp', []))
    time_axis = np.arange(len(bvp)) / fs

    # 1. Blood Volume Pulse (BVP) Waveforms (6s Window)
    six_s_idx = min(len(bvp), int(fs * 6))
    if six_s_idx > 0:
        axs[0, 0].plot(time_axis[:six_s_idx], bvp[:six_s_idx], color='#2ca02c', lw=2, label=f"BVP Pulse ({analysis.get('dominant_bpm', 72)} BPM)")
        # Plot systolic peaks in this window
        peaks = [p for p in analysis.get('peaks', []) if p < six_s_idx]
        if peaks:
            axs[0, 0].scatter(time_axis[peaks], bvp[peaks], color='red', s=40, zorder=5, label=f"Detected Peaks (N={len(peaks)})")
    axs[0, 0].set_title("1. Blood Volume Pulse (BVP) Waveforms (6s Window)", fontweight='semibold')
    axs[0, 0].set_xlabel("Relative Time (seconds)")
    axs[0, 0].set_ylabel("Normalized Amplitude")
    axs[0, 0].grid(True, alpha=0.3)
    axs[0, 0].legend(loc='upper right')

    # 2. Respiration Spectrum (RIIV / RSA Breathing Rate)
    resp_rate = analysis.get('respiration_brpm', 16.0)
    axs[0, 1].bar(["Measured RR"], [resp_rate], color='#ff7f0e', width=0.35, label=f"RR: {resp_rate} BrPM")
    axs[0, 1].axhline(12, color='gray', linestyle=':', label='Normal Min (12)')
    axs[0, 1].axhline(20, color='gray', linestyle='--', label='Normal Max (20)')
    axs[0, 1].set_title("2. Respiration Spectrum (RIIV/RSA Breathing Rate)", fontweight='semibold')
    axs[0, 1].set_ylabel("Breaths Per Minute (BrPM)")
    axs[0, 1].set_ylim(0, max(35, resp_rate + 10))
    axs[0, 1].grid(True, alpha=0.3)
    axs[0, 1].legend(loc='upper right')

    # 3. HRV Power Spectrum (Autonomic Tone LF/HF)
    lf_hf = analysis.get('lf_hf_ratio', 1.2)
    tone_color = '#d62728' if lf_hf > 2.5 else '#1f77b4'
    axs[1, 0].bar(["LF/HF Ratio"], [lf_hf], color=tone_color, width=0.35, label=f"LF/HF: {lf_hf}")
    axs[1, 0].axhline(1.0, color='gray', linestyle='--', label='Sympathetic Balance')
    axs[1, 0].set_title("3. HRV Power Spectrum (Autonomic Tone LF/HF)", fontweight='semibold')
    axs[1, 0].set_ylabel("Normalized Power Ratio")
    axs[1, 0].set_ylim(0, max(4.0, lf_hf + 1.0))
    axs[1, 0].grid(True, alpha=0.3)
    axs[1, 0].legend(loc='upper right')

    # 4. Poincaré Plot (Non-Linear Heartbeat Dynamics)
    ibis = np.array(analysis.get('ibi_series', []))
    if len(ibis) > 1:
        x_ibi = ibis[:-1]
        y_ibi = ibis[1:]
        axs[1, 1].scatter(x_ibi, y_ibi, color='#2ca02c', alpha=0.7, edgecolors='k', s=45, label='Beat Pairs')
        min_v = min(np.min(x_ibi), np.min(y_ibi)) - 50
        max_v = max(np.max(x_ibi), np.max(y_ibi)) + 50
        axs[1, 1].plot([min_v, max_v], [min_v, max_v], '--', color='gray', label='Line of Identity (y=x)')
        axs[1, 1].set_xlim(min_v, max_v)
        axs[1, 1].set_ylim(min_v, max_v)
    axs[1, 1].set_title(f"4. Poincaré Plot (SD1: {analysis.get('poincare_sd1', 0)}ms, SD2: {analysis.get('poincare_sd2', 0)}ms)", fontweight='semibold')
    axs[1, 1].set_xlabel(r"$IBI_n$ (ms)")
    axs[1, 1].set_ylabel(r"$IBI_{n+1}$ (ms)")
    axs[1, 1].grid(True, alpha=0.3)
    axs[1, 1].legend(loc='upper left')

    # 5. Autonomic & Vascular Tone Biomarkers
    v_labels = ['RMSSD (ms)\n[Vagal Tone]', 'pNN50 (%)\n[Parasympathetic]', 'Pulse Crest\nTime (ms)']
    v_vals = [
        analysis.get('rmssd_ms', 35.0),
        analysis.get('pnn50_pct', 12.0),
        analysis.get('pulse_crest_time_ms', 180.0)
    ]
    bar_colors = ['#1f77b4', '#ff7f0e', '#2ca02c']
    bars = axs[2, 0].bar(v_labels, v_vals, color=bar_colors, width=0.45)
    for bar, val in zip(bars, v_vals):
        axs[2, 0].text(bar.get_x() + bar.get_width()/2, val + 2, f"{val:.1f}", ha='center', fontweight='bold')
    axs[2, 0].set_title("5. Autonomic & Vascular Tone Biomarkers", fontweight='semibold')
    axs[2, 0].grid(True, alpha=0.3)

    # 6. Hemodynamics & Sympathetic Excitation
    h_labels = ['Heart Rate\n(BPM)', 'Perfusion\nIndex (%)', 'Relative SpO2\nProxy (%)']
    h_vals = [
        analysis.get('dominant_bpm', 72.0),
        analysis.get('perfusion_index', 4.0),
        analysis.get('spo2_percent', 98.0)
    ]
    h_colors = ['#d62728', '#17becf', '#e377c2']
    h_bars = axs[2, 1].bar(h_labels, h_vals, color=h_colors, width=0.45)
    for bar, val in zip(h_bars, h_vals):
        axs[2, 1].text(bar.get_x() + bar.get_width()/2, val + 2, f"{val:.1f}", ha='center', fontweight='bold')
    axs[2, 1].set_title("6. Hemodynamics & Sympathetic Excitation", fontweight='semibold')
    axs[2, 1].grid(True, alpha=0.3)

    plt.tight_layout()
    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    plt.savefig(output_path, dpi=130, bbox_inches='tight')
    plt.close()
    return output_path
