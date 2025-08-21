class ImageQualityScorer {
  constructor(config = {}) {
    this.config = {
      baseScore: 100,
      minScore: 1,
      penalties: {
        faceOccluded: 30,
        sunglasses: 20,
        eyesClosed: 15,
        lowBrightness: 10,
        lowSharpness: 10,
        noSmile: 5,
        mouthOpen: 5,
        badPose: 10,
      },
      thresholds: {
        brightness: { min: 50, max: 100 },
        sharpness: { min: 10, max: 100 },
        pose: { pitch: 15, roll: 15, yaw: 15 },
      },
      confidenceThreshold: 80, // Minimum confidence for reliable detection
      ...config,
    };
  }

  calculateImageQualityScore(faceData) {
    if (!this.isValidFaceData(faceData)) {
      return this.config.minScore;
    }

    let score = this.config.baseScore;
    const penalties = [];

    // Use array of checks for better maintainability and debugging
    const qualityChecks = [
      {
        condition: () =>
          faceData.FaceOccluded?.Value &&
          faceData.FaceOccluded.Confidence > this.config.confidenceThreshold,
        penalty: this.config.penalties.faceOccluded,
        reason: "Face occluded",
      },
      {
        condition: () =>
          faceData.Sunglasses?.Value &&
          faceData.Sunglasses.Confidence > this.config.confidenceThreshold,
        penalty: this.config.penalties.sunglasses,
        reason: "Sunglasses detected",
      },
      {
        condition: () =>
          !faceData.EyesOpen?.Value &&
          faceData.EyesOpen?.Confidence > this.config.confidenceThreshold,
        penalty: this.config.penalties.eyesClosed,
        reason: "Eyes closed",
      },
      {
        condition: () => this.isBrightnessLow(faceData.Quality?.Brightness),
        penalty: this.calculateBrightnessPenalty(faceData.Quality?.Brightness),
        reason: "Low brightness",
      },
      {
        condition: () => this.isSharpnessLow(faceData.Quality?.Sharpness),
        penalty: this.calculateSharpnessPenalty(faceData.Quality?.Sharpness),
        reason: "Low sharpness",
      },
      {
        condition: () =>
          !faceData.Smile?.Value &&
          faceData.Smile?.Confidence > this.config.confidenceThreshold,
        penalty: this.config.penalties.noSmile,
        reason: "No smile detected",
      },
      {
        condition: () =>
          faceData.MouthOpen?.Value &&
          faceData.MouthOpen.Confidence > this.config.confidenceThreshold,
        penalty: this.config.penalties.mouthOpen,
        reason: "Mouth open",
      },
      {
        condition: () => this.isPosePoor(faceData.Pose),
        penalty: this.calculatePosePenalty(faceData.Pose),
        reason: "Poor face pose",
      },
    ];

    // Apply penalties and track reasons
    for (const check of qualityChecks) {
      if (check.condition()) {
        score -= check.penalty;
        penalties.push({ reason: check.reason, penalty: check.penalty });
      }
    }

    const finalScore = Math.max(score, this.config.minScore);

    return {
      score: finalScore,
      penalties: penalties,
      confidence: this.calculateOverallConfidence(faceData),
    };
  }

  // Enhanced quality checks with confidence consideration
  isValidFaceData(faceData) {
    return (
      faceData &&
      typeof faceData === "object" &&
      faceData.Confidence > this.config.confidenceThreshold
    );
  }

  isBrightnessLow(brightness) {
    return (
      brightness != null && brightness < this.config.thresholds.brightness.min
    );
  }

  isSharpnessLow(sharpness) {
    return (
      sharpness != null && sharpness < this.config.thresholds.sharpness.min
    );
  }

  isPosePoor(pose) {
    if (!pose) return false;

    const { pitch, roll, yaw } = this.config.thresholds.pose;
    return (
      Math.abs(pose.Pitch) > pitch ||
      Math.abs(pose.Roll) > roll ||
      Math.abs(pose.Yaw) > yaw
    );
  }

  // Graduated penalties based on severity
  calculateBrightnessPenalty(brightness) {
    if (brightness == null) return 0;

    const { min, max } = this.config.thresholds.brightness;
    if (brightness >= min) return 0;

    // More severe penalty for very dark images
    const ratio = brightness / min;
    return Math.round(this.config.penalties.lowBrightness * (1 + (1 - ratio)));
  }

  calculateSharpnessPenalty(sharpness) {
    if (sharpness == null) return 0;

    const { min, max } = this.config.thresholds.sharpness;
    if (sharpness >= min) return 0;

    // More severe penalty for very blurry images
    const ratio = sharpness / min;
    return Math.round(this.config.penalties.lowSharpness * (1 + (1 - ratio)));
  }

  calculatePosePenalty(pose) {
    if (!pose) return 0;

    const { pitch, roll, yaw } = this.config.thresholds.pose;
    let penalty = 0;

    // Graduated penalty based on how far off the pose is
    if (Math.abs(pose.Pitch) > pitch) {
      penalty += Math.round(
        this.config.penalties.badPose * (Math.abs(pose.Pitch) / pitch - 1)
      );
    }
    if (Math.abs(pose.Roll) > roll) {
      penalty += Math.round(
        this.config.penalties.badPose * (Math.abs(pose.Roll) / roll - 1)
      );
    }
    if (Math.abs(pose.Yaw) > yaw) {
      penalty += Math.round(
        this.config.penalties.badPose * (Math.abs(pose.Yaw) / yaw - 1)
      );
    }

    return Math.min(penalty, this.config.penalties.badPose * 2); // Cap the penalty
  }

  calculateOverallConfidence(faceData) {
    const confidenceFields = [
      faceData.Confidence,
      faceData.FaceOccluded?.Confidence,
      faceData.Sunglasses?.Confidence,
      faceData.EyesOpen?.Confidence,
      faceData.Smile?.Confidence,
      faceData.MouthOpen?.Confidence,
    ].filter((c) => c != null);

    return confidenceFields.length > 0
      ? Math.round(
          confidenceFields.reduce((sum, c) => sum + c, 0) /
            confidenceFields.length
        )
      : 0;
  }

  calculateScoresForMultipleFaces(facesData) {
    return facesData.map((face, index) => ({
      faceIndex: index,
      ...this.calculateImageQualityScore(face),
    }));
  }

  getBestFaces(facesData, minThresholdScore = 70) {
    const scores = this.calculateScoresForMultipleFaces(facesData);

    const qualifyingFaces = scores.filter(
      (face) => face.score >= minThresholdScore
    );

    return qualifyingFaces
      .sort((a, b) => b.score - a.score)
      .map((face) => ({
        ...facesData[face.faceIndex],
        faceIndex: face.faceIndex,
        qualityScore: face.score,
        qualityConfidence: face.confidence,
        qualityPenalties: face.penalties,
      }));
  }
}

export default ImageQualityScorer;
