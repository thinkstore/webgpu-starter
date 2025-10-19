// data structure to store output of vertex function
struct VertexOut {
  @builtin(position) pos: vec4f,
  @location(0) color: vec4f
};

// process the points of the triangle
@vertex 
fn vs(
       @builtin(vertex_index) vertexIndex : u32
   ) -> VertexOut {
      let pos = array(
          vec2f(   0,  0.8),  // top center
          vec2f(-0.8, -0.8),  // bottom left
          vec2f( 0.8, -0.8)   // bottom right
      );

      let color = array(
          vec4f(1.0, .0, .0, .0),
          vec4f( .0, 1., .0, .0),
          vec4f( .0, .0, 1., .0)
      );

      var out: VertexOut;
      out.pos = vec4f(pos[vertexIndex], 0.0, 1.0);
      out.color = color[vertexIndex];

      return out;
}
 