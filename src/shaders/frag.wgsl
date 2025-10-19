// data structure to input to fragment shader
struct VertexOut {
    @builtin(position) pos: vec4f,
    @location(0) color: vec4f
};

// set the colors of the area within the triangle
@fragment 
fn fs(in: VertexOut) -> @location(0) vec4f {
    return in.color;
}
   