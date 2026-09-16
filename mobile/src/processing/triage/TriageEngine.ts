import { ContactPressureFeedback, PRVMetrics, RespirationResult, TriageSeverity, TriageStatus } from '../types';

export class TriageEngine {
  private stableContactStartSec: number | null = null;
  private consecutiveAsystoleFrames: number = 0;
  private consecutiveAgonalFrames: number = 0;

  public reset(): void {
    this.stableContactStartSec = null;
    this.consecutiveAsystoleFrames = 0;
    this.consecutiveAgonalFrames = 0;
  }

  /**
   * Evaluates current vitals, rhythm, and contact state to detect collapse emergencies.
   */
  public evaluate(
    elapsedSec: number,
    pressure: ContactPressureFeedback,
    prv: PRVMetrics | null,
    respiration: RespirationResult | null,
    hasRecentBeats: boolean
  ): TriageStatus {
    // If contact is not established or under-pressure, maintain positioning guidance
    if (!pressure.isStable && pressure.state !== 'OPTIMAL') {
      this.stableContactStartSec = null;
      this.consecutiveAsystoleFrames = 0;
      return {
        severity: 'NORMAL',
        alertHeadline: 'POSITION SENSOR',
        actionPrompt: pressure.message,
        cprRequired: false,
        cprMetronomeBpm: 0,
        pulseDetected: false,
        agonalBreathing: false,
      };
    }

    if (this.stableContactStartSec === null) {
      this.stableContactStartSec = elapsedSec;
    }

    const contactDuration = elapsedSec - this.stableContactStartSec;

    // Check for pulselessness / asystole:
    // Once contact has been held for > 3.5 seconds, if PI < 0.05% or no valid beats detected
    const isVeryLowPerfusion = pressure.perfusionIndexG < 0.05;
    const isPulseless = contactDuration >= 3.5 && (isVeryLowPerfusion || !hasRecentBeats);

    if (isPulseless) {
      this.consecutiveAsystoleFrames++;
    } else {
      this.consecutiveAsystoleFrames = Math.max(0, this.consecutiveAsystoleFrames - 2);
    }

    // Trigger CPR if pulselessness confirmed for > 15 consecutive checks (~1-2 seconds)
    if (this.consecutiveAsystoleFrames >= 15) {
      return {
        severity: 'CRITICAL_CPR_ASYSTOLE',
        alertHeadline: 'NO PULSE DETECTED',
        actionPrompt: 'START CPR IMMEDIATELY: PUSH HARD & FAST IN THE CENTER OF CHEST',
        cprRequired: true,
        cprMetronomeBpm: 110,
        pulseDetected: false,
        agonalBreathing: false,
      };
    }

    const currentHR = prv?.timeDomain.meanHrBpm ?? 0;

    // Extreme ventricular tachycardia / fibrillation check
    if (contactDuration >= 4.0 && currentHR > 190) {
      return {
        severity: 'CRITICAL_CPR_VF_VT',
        alertHeadline: 'LETHAL TACHYARRHYTHMIA DETECTED',
        actionPrompt: 'VERIFY PATIENT CONSCIOUSNESS — PREPARE FOR CPR',
        cprRequired: true,
        cprMetronomeBpm: 110,
        pulseDetected: true,
        agonalBreathing: false,
      };
    }

    // Respiratory depression / agonal breathing check
    const currentRR = respiration?.respiratoryRateBrPM ?? 14;
    const isAgonal = contactDuration >= 5.0 && (currentRR < 6.0 || (currentRR < 8.0 && respiration?.confidence !== undefined && respiration.confidence < 0.5));

    if (isAgonal) {
      this.consecutiveAgonalFrames++;
      if (this.consecutiveAgonalFrames >= 15) {
        return {
          severity: 'CRITICAL_AIRWAY_AGONAL',
          alertHeadline: 'RESPIRATORY ARREST / AGONAL GASPING',
          actionPrompt: 'OPEN AIRWAY IMMEDIATELY — PROVIDE RESCUE BREATHS',
          cprRequired: false,
          cprMetronomeBpm: 0,
          pulseDetected: true,
          agonalBreathing: true,
        };
      }
    } else {
      this.consecutiveAgonalFrames = Math.max(0, this.consecutiveAgonalFrames - 1);
    }

    // Warnings: severe bradycardia or minor arrhythmia
    if (contactDuration >= 4.0 && currentHR > 0 && currentHR < 42) {
      return {
        severity: 'WARNING_ARRHYTHMIA',
        alertHeadline: 'SEVERE BRADYCARDIA',
        actionPrompt: 'KEEP PATIENT RECLINED — MONITOR CLOSELY FOR LOSS OF PULSE',
        cprRequired: false,
        cprMetronomeBpm: 0,
        pulseDetected: true,
        agonalBreathing: false,
      };
    }

    // Normal hemodynamic monitoring state
    return {
      severity: 'NORMAL',
      alertHeadline: 'VITAL SIGNS MONITORED',
      actionPrompt: 'HOLD PHONE STEADY AGAINST CHEST',
      cprRequired: false,
      cprMetronomeBpm: 0,
      pulseDetected: hasRecentBeats,
      agonalBreathing: false,
    };
  }
}
