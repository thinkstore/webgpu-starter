type CircleOptions = {
  radius?: number;
  numSubdivisions?: number;
  innerRadius?: number;
  startAngle?: number;
  endAngle?: number;
};

export class Circle {
  public vertexData!: Float32Array;
  public numVertices: number;

  constructor({
    radius = 1,
    numSubdivisions = 24,
    innerRadius = 0,
    startAngle = 0,
    endAngle = Math.PI * 2,
  }: CircleOptions = {}) {
    this.numVertices = numSubdivisions * 3 * 2;
    this.vertexData = new Float32Array(this.numVertices * 2); // 2 values (x, y) per vertex
    let offset = 0;
    const addVertex = (x: number, y: number): void => {
      this.vertexData[offset++] = x;
      this.vertexData[offset++] = y;
    };

    for (let i = 0; i < numSubdivisions; ++i) {
      const angle1 = startAngle + ((i + 0) * (endAngle - startAngle)) / numSubdivisions;
      const angle2 = startAngle + ((i + 1) * (endAngle - startAngle)) / numSubdivisions;

      const c1 = Math.cos(angle1);
      const s1 = Math.sin(angle1);
      const c2 = Math.cos(angle2);
      const s2 = Math.sin(angle2);

      // first triangle
      addVertex(c1 * radius, s1 * radius);
      addVertex(c2 * radius, s2 * radius);
      addVertex(c1 * innerRadius, s1 * innerRadius);

      // second triangle
      addVertex(c1 * innerRadius, s1 * innerRadius);
      addVertex(c2 * radius, s2 * radius);
      addVertex(c2 * innerRadius, s2 * innerRadius);
    }
  }
}
