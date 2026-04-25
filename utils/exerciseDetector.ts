import { calculateAngle, Point2D } from '../utils/angleUtils';

// -- Types ---------------------------------------------------------------------

export type ExerciseType = 'squat' | 'pushup' | 'lunge';

/** The two phases of a rep. */
export type ExercisePhase = 'up' | 'down';

/** Categories of detected form errors. */
export type FormErrorType =
  // Squat Errors
  | 'KNEE_VALGUS'
  | 'BAD_BACK'
  // Push-up Errors
  | 'FLARED_ELBOWS'
  | 'SAGGING_HIPS'
  // Lunge Errors
  | 'KNEE_OVER_TOES'
  | 'SHORT_STEP';

/** How serious the form error is. */
export type FormErrorSeverity = 'warning' | 'error';

/** A single form error detected in one frame. */
export interface FormError {
  type: FormErrorType;
  severity: FormErrorSeverity;
  timestamp: number;
}

/** Snapshot returned after every frame update. */
export interface ExerciseState {
  reps: number;
  phase: ExercisePhase;
  primaryAngle: number;
  errors: FormError[];
}

export interface LandmarkPoints {
  leftShoulder?: Point2D;
  rightShoulder?: Point2D;
  leftElbow?: Point2D;
  rightElbow?: Point2D;
  leftWrist?: Point2D;
  rightWrist?: Point2D;
  leftHip?: Point2D;
  rightHip?: Point2D;
  leftKnee?: Point2D;
  rightKnee?: Point2D;
  leftAnkle?: Point2D;
  rightAnkle?: Point2D;
  leftHeel?: Point2D;
  rightHeel?: Point2D;
  leftFootIndex?: Point2D;
  rightFootIndex?: Point2D;
}

// -- Factory function ----------------------------------------------------------

export function createExerciseDetector(exercise: ExerciseType = 'squat') {
  let reps: number = 0;
  let phase: ExercisePhase = 'up';

  function update(points: LandmarkPoints): ExerciseState {
    const state: ExerciseState = {
      reps,
      phase,
      primaryAngle: 180,
      errors: [],
    };

    switch (exercise) {
      case 'squat':
        updateSquat(points, state);
        break;
      case 'pushup':
        updatePushup(points, state);
        break;
      case 'lunge':
        updateLunge(points, state);
        break;
    }

    reps = state.reps;
    phase = state.phase;
    return state;
  }

  function reset() {
    reps = 0;
    phase = 'up';
  }

  // -- SQUAT ------------------------------------------------------------------
  function updateSquat(points: LandmarkPoints, state: ExerciseState) {
    if (!points.leftHip || !points.leftKnee || !points.leftAnkle || !points.rightHip || !points.rightKnee || !points.rightAnkle) return;

    const leftKneeAngle = calculateAngle(points.leftHip, points.leftKnee, points.leftAnkle);
    const rightKneeAngle = calculateAngle(points.rightHip, points.rightKnee, points.rightAnkle);
    const avgKneeAngle = (leftKneeAngle + rightKneeAngle) / 2;
    state.primaryAngle = avgKneeAngle;

    if (state.phase === 'up' && avgKneeAngle <= 100) {
      state.phase = 'down';
    } else if (state.phase === 'down' && avgKneeAngle >= 160) {
      state.phase = 'up';
      state.reps++;
    }

    // Errors
    const valgusLeftInward = points.leftAnkle.x - points.leftKnee.x;
    const valgusRightInward = points.rightKnee.x - points.rightAnkle.x;
    const maxValgus = Math.max(valgusLeftInward, valgusRightInward);
    if (maxValgus >= 0.07) {
      state.errors.push({ type: 'KNEE_VALGUS', severity: 'error', timestamp: Date.now() });
    } else if (maxValgus >= 0.03) {
      state.errors.push({ type: 'KNEE_VALGUS', severity: 'warning', timestamp: Date.now() });
    }

    if (points.leftShoulder && points.rightShoulder) {
      const leftHipAngle = calculateAngle(points.leftShoulder, points.leftHip, points.leftKnee);
      const rightHipAngle = calculateAngle(points.rightShoulder, points.rightHip, points.rightKnee);
      const minHipAngle = Math.min(leftHipAngle, rightHipAngle);

      if (minHipAngle <= 130) {
        state.errors.push({ type: 'BAD_BACK', severity: 'error', timestamp: Date.now() });
      } else if (minHipAngle <= 150) {
        state.errors.push({ type: 'BAD_BACK', severity: 'warning', timestamp: Date.now() });
      }
    }
  }

  // -- PUSH-UP ----------------------------------------------------------------
  function updatePushup(points: LandmarkPoints, state: ExerciseState) {
    if (!points.leftShoulder || !points.leftElbow || !points.leftWrist || !points.rightShoulder || !points.rightElbow || !points.rightWrist) return;

    const leftElbowAngle = calculateAngle(points.leftShoulder, points.leftElbow, points.leftWrist);
    const rightElbowAngle = calculateAngle(points.rightShoulder, points.rightElbow, points.rightWrist);
    const avgElbowAngle = (leftElbowAngle + rightElbowAngle) / 2;
    state.primaryAngle = avgElbowAngle;

    if (state.phase === 'up' && avgElbowAngle <= 90) {
      state.phase = 'down';
    } else if (state.phase === 'down' && avgElbowAngle >= 160) {
      state.phase = 'up';
      state.reps++;
    }

    // Errors
    if (points.leftHip && points.leftKnee && points.rightHip && points.rightKnee) {
      const leftBodyAngle = calculateAngle(points.leftShoulder, points.leftHip, points.leftKnee);
      const rightBodyAngle = calculateAngle(points.rightShoulder, points.rightHip, points.rightKnee);
      const minBodyAngle = Math.min(leftBodyAngle, rightBodyAngle);

      if (minBodyAngle <= 140) {
        state.errors.push({ type: 'SAGGING_HIPS', severity: 'error', timestamp: Date.now() });
      } else if (minBodyAngle <= 160) {
        state.errors.push({ type: 'SAGGING_HIPS', severity: 'warning', timestamp: Date.now() });
      }
    }

    if (points.leftHip && points.rightHip) {
      const leftArmTorsoAngle = calculateAngle(points.leftHip, points.leftShoulder, points.leftElbow);
      const rightArmTorsoAngle = calculateAngle(points.rightHip, points.rightShoulder, points.rightElbow);
      const maxFlared = Math.max(leftArmTorsoAngle, rightArmTorsoAngle);

      if (maxFlared >= 60) {
        state.errors.push({ type: 'FLARED_ELBOWS', severity: 'error', timestamp: Date.now() });
      } else if (maxFlared >= 45) {
        state.errors.push({ type: 'FLARED_ELBOWS', severity: 'warning', timestamp: Date.now() });
      }
    }
  }

  // -- LUNGE ------------------------------------------------------------------
  function updateLunge(points: LandmarkPoints, state: ExerciseState) {
    if (!points.leftHip || !points.leftKnee || !points.leftAnkle || !points.rightHip || !points.rightKnee || !points.rightAnkle) return;

    const leftKneeAngle = calculateAngle(points.leftHip, points.leftKnee, points.leftAnkle);
    const rightKneeAngle = calculateAngle(points.rightHip, points.rightKnee, points.rightAnkle);
    
    // Front leg is the one with the tighter angle or positioned more forward depending on perspective.
    const primaryKneeAngle = Math.min(leftKneeAngle, rightKneeAngle);
    state.primaryAngle = primaryKneeAngle;

    if (state.phase === 'up' && primaryKneeAngle <= 100) {
      state.phase = 'down';
    } else if (state.phase === 'down' && primaryKneeAngle >= 160) {
      state.phase = 'up';
      state.reps++;
    }

    // Errors
    if (points.leftFootIndex && points.rightFootIndex) {
        // Knee over toes check
        const leftKneeOverToes = Math.abs(points.leftKnee.x - points.leftFootIndex.x);
        const rightKneeOverToes = Math.abs(points.rightKnee.x - points.rightFootIndex.x);
        // Assuming side profile, if the knee extends heavily past the foot index horizontally
        const maxKneeOverToes = Math.max(leftKneeOverToes, rightKneeOverToes);
        
        if (maxKneeOverToes > 0.1) {
          state.errors.push({ type: 'KNEE_OVER_TOES', severity: 'error', timestamp: Date.now() });
        } else if (maxKneeOverToes > 0.05) {
          state.errors.push({ type: 'KNEE_OVER_TOES', severity: 'warning', timestamp: Date.now() });
        }
    }
  }

  return { update, reset };
}
