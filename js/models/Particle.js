import { PARTICLE_MASS } from "../config.js";

export class Particle {
  constructor(id, x, y, vx, vy, mass = PARTICLE_MASS) {
    this.id = id;
    this.x = x;
    this.y = y;
    this.prevX = x;
    this.prevY = y;
    this.vx = vx;
    this.vy = vy;
    this.ax = 0;
    this.ay = 0;
    this.fx = 0;
    this.fy = 0;
    this.mass = mass;
    this.neighbors = 0;
    this.restX = x;
    this.restY = y;
    this.instantTemperature = null;
    this.displayTemperature = null;
  }

  speed2() {
    return this.vx * this.vx + this.vy * this.vy;
  }

  kineticEnergy() {
    return 0.5 * this.mass * this.speed2();
  }
}
