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
    this.vertexData = new Float32Array(this.numVertices * (2 + 3)); // 2 values (x, y) per vertex
    let offset = 0;
    const addVertex = (x: number, y: number, r: number, g: number, b: number): void => {
      this.vertexData[offset++] = x;
      this.vertexData[offset++] = y;

      this.vertexData[offset++] = r;
      this.vertexData[offset++] = g;
      this.vertexData[offset++] = b;
    };

    const innerColor: [number, number, number] = [1, 1, 1];
    const outerColor: [number, number, number] = [0.1, 0.1, 0.1];

    for (let i = 0; i < numSubdivisions; ++i) {
      const angle1 = startAngle + ((i + 0) * (endAngle - startAngle)) / numSubdivisions;
      const angle2 = startAngle + ((i + 1) * (endAngle - startAngle)) / numSubdivisions;

      const c1 = Math.cos(angle1);
      const s1 = Math.sin(angle1);
      const c2 = Math.cos(angle2);
      const s2 = Math.sin(angle2);

      // first triangle
      addVertex(c1 * radius, s1 * radius, ...outerColor);
      addVertex(c2 * radius, s2 * radius, ...outerColor);
      addVertex(c1 * innerRadius, s1 * innerRadius, ...innerColor);

      // second triangle
      addVertex(c1 * innerRadius, s1 * innerRadius, ...innerColor);
      addVertex(c2 * radius, s2 * radius, ...outerColor);
      addVertex(c2 * innerRadius, s2 * innerRadius, ...innerColor);
    }
  }
}
