/**
 * Central, immutable engine configuration.
 *
 * Everything that defines how the world is projected to pixels lives here so
 * that gameplay code, rendering and tests share one source of truth. Never
 * patch a visual misalignment with a local offset — fix it here or in
 * CoordinateUtils.
 */

export const SIMULATION = {
  /** Fixed simulation rate. Gameplay always advances in steps of 1/TICK_RATE s. */
  TICK_RATE: 60,
  /** Upper bound for one rendered frame's real time (s) to avoid the spiral of death. */
  MAX_FRAME_TIME: 0.25,
  /** Hard cap on simulation steps per rendered frame. */
  MAX_STEPS_PER_FRAME: 8,
} as const;

export const FIXED_DT = 1 / SIMULATION.TICK_RATE;

/**
 * Isometric projection.
 *
 * World: X right/east, Y up, Z south (toward the viewer). 1 world unit = 1 tile = 1 metre.
 * The camera looks down the (-1, -h, -1) diagonal: yaw 45°.
 *
 * Elevation = TRUE ISOMETRIC (atan(1/√2) ≈ 35.264°): ground edges run at 30° on screen
 * and a tile is a 64 × 36.95 px diamond (√3 : 1). This matches the art direction —
 * every BLOCKOUT asset sheet is drawn with 28–31° edges (measured with
 * tools/measure_iso_angles.py). The previous 30° elevation gave 2:1 tiles
 * (26.57° edges), which made all props look tilted against the floor.
 */
const TRUE_ISO_ELEVATION_DEG = (Math.atan(1 / Math.SQRT2) * 180) / Math.PI;
const TILE_PIXEL_WIDTH = 64;

export const PROJECTION = {
  YAW_DEG: 45,
  ELEVATION_DEG: TRUE_ISO_ELEVATION_DEG,
  /**
   * Base pixels per world unit along the screen horizontal at zoom 1.
   * A 1×1 tile then projects to a TILE_PIXEL_WIDTH × TILE_PIXEL_HEIGHT diamond.
   */
  TILE_PIXEL_WIDTH,
  /** Derived: width × sin(elevation) ≈ 36.95 px. */
  TILE_PIXEL_HEIGHT: TILE_PIXEL_WIDTH * Math.sin((TRUE_ISO_ELEVATION_DEG * Math.PI) / 180),
  /** Screen angle of ground edges, degrees (30° for true isometric). */
  GROUND_EDGE_ANGLE_DEG: (Math.atan(Math.sin((TRUE_ISO_ELEVATION_DEG * Math.PI) / 180)) * 180) / Math.PI,
} as const;

/** Derived: world units → art pixels along the camera's right axis. */
export const PIXELS_PER_UNIT = PROJECTION.TILE_PIXEL_WIDTH / Math.SQRT2;

export const RENDER = {
  /** Integer upscale factors: device pixels per art pixel. Integer = every art pixel identical in size. */
  ZOOM_LEVELS: [1, 2, 3, 4, 5, 6] as const,
  /**
   * Auto-zoom picks the largest level that still shows at least this many art
   * pixels along the screen's SHORT side. Tuning value — verify on real phones.
   */
  MIN_ART_PIXELS_SHORT_SIDE: 360,
  /** Never render more than this many device pixels per CSS pixel (battery / fill-rate). */
  MAX_DEVICE_PIXEL_RATIO: 3,
  CLEAR_COLOR: 0x0b0d1a,
} as const;

export const CAMERA = {
  /** Exponential follow stiffness (1/s). Higher = tighter. Critically damped, never overshoots. */
  FOLLOW_STIFFNESS: 10,
  /** Below this distance (world units) the camera is considered settled. */
  SETTLE_EPSILON: 0.0005,
} as const;

export const PLAYER = {
  WALK_SPEED: 3.2,
  RUN_SPEED: 5.6,
  /** Collision circle radius in world units (≈ shoulder width / 2). */
  RADIUS: 0.3,
  /** Time (s) to reach full speed from standstill. */
  ACCEL_TIME: 0.08,
  DECEL_TIME: 0.06,
} as const;
