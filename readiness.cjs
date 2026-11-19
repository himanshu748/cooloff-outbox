function createReadiness(SDK, CameraSelection, bundles) {
  let active = null;
  return {
    async cancel() {
      await active?.done;
    },
    async check({
      apiKey,
      cameraName,
      breathingOnly,
      enableTelemetry,
      frameTransform = 0,
      excludedMetrics = [],
    }) {
      if (active) throw new Error('A readiness check is already running.');
      const sdk = new SDK({
        apiKey,
        enableTelemetry: enableTelemetry === true,
        requestedMetrics: breathingOnly
          ? [...bundles.breathingMetrics]
          : [
              ...bundles.breathingMetrics,
              ...bundles.cardioMetrics,
              ...bundles.faceMetrics,
            ].filter((metric) => !excludedMetrics.includes(metric)),
      });
      let release;
      active = {
        done: new Promise((resolve) => {
          release = resolve;
        }),
      };
      try {
        const cameras = SDK.availableCameras().filter(
          (item) => item.name === cameraName,
        );
        const camera = cameras.length === 1 ? cameras[0] : null;
        // Browser device IDs and native camera IDs are not interchangeable.
        if (!camera) {
          sdk.useCustomInput(frameTransform);
          await sdk.checkDeviceReadiness();
          return {
            verdict: 'inconclusive',
            reason:
              'This browser camera could not be matched to a native camera. Readiness cannot assess custom streams. You may try measurement; no readiness guarantee is made.',
          };
        }
        sdk.useCamera(CameraSelection.byId(camera.id), {
          width: 1280,
          height: 720,
          fps: 30,
          frameTransform,
        });
        const result = await sdk.checkDeviceReadiness();
        return { verdict: result.verdict, reason: result.reason };
      } catch (error) {
        return {
          verdict: 'inconclusive',
          reason: `Readiness could not complete: ${error.message}`,
        };
      } finally {
        try {
          await sdk.destroy();
        } finally {
          active = null;
          release();
        }
      }
    },
  };
}
module.exports = { createReadiness };
