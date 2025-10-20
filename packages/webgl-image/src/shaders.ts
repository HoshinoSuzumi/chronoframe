/**
 * 顶点着色器源代码
 */
export const VERTEX_SHADER_SOURCE = `
  attribute vec2 a_position;
  attribute vec2 a_texCoord;
  
  uniform mat3 u_matrix;
  uniform vec2 u_resolution;
  
  varying vec2 v_texCoord;
  
  void main() {
    // 将顶点位置从像素坐标转换为裁剪空间坐标
    vec2 position = (u_matrix * vec3(a_position, 1)).xy;
    
    // 从像素坐标转换为 0 到 1
    vec2 zeroToOne = position / u_resolution;
    
    // 从 0->1 转换为 0->2
    vec2 zeroToTwo = zeroToOne * 2.0;
    
    // 从 0->2 转换为 -1->+1 (裁剪空间)
    vec2 clipSpace = zeroToTwo - 1.0;
    
    gl_Position = vec4(clipSpace * vec2(1, -1), 0, 1);
    
    // 传递纹理坐标给片段着色器
    v_texCoord = a_texCoord;
  }
`

/**
 * 片段着色器源代码
 */
export const FRAGMENT_SHADER_SOURCE = `
  precision mediump float;
  
  uniform sampler2D u_image;
  uniform bool u_debugTiles;
  uniform vec4 u_tileBorderColor;
  uniform vec2 u_tileBorderWidth;
  
  varying vec2 v_texCoord;
  
  void main() {
    vec4 color = texture2D(u_image, v_texCoord);

    if (u_debugTiles) {
      float left = 1.0 - step(u_tileBorderWidth.x, v_texCoord.x);
      float right = 1.0 - step(u_tileBorderWidth.x, 1.0 - v_texCoord.x);
      float top = 1.0 - step(u_tileBorderWidth.y, v_texCoord.y);
      float bottom = 1.0 - step(u_tileBorderWidth.y, 1.0 - v_texCoord.y);
      float border = clamp(max(max(left, right), max(top, bottom)), 0.0, 1.0);
      color = mix(color, u_tileBorderColor, border);
    }

    gl_FragColor = color;
  }
`

/**
 * 创建着色器
 */
export function createShader(
  gl: WebGLRenderingContext,
  type: number,
  source: string
): WebGLShader | null {
  const shader = gl.createShader(type)
  if (!shader) {
    console.error('Unable to create shader')
    return null
  }
  
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error('An error occurred compiling the shaders:', gl.getShaderInfoLog(shader))
    gl.deleteShader(shader)
    return null
  }
  
  return shader
}

/**
 * 创建着色器程序
 */
export function createShaderProgram(
  gl: WebGLRenderingContext,
  vertexShader: WebGLShader,
  fragmentShader: WebGLShader
): WebGLProgram | null {
  const shaderProgram = gl.createProgram()
  if (!shaderProgram) {
    console.error('Unable to create shader program')
    return null
  }
  
  gl.attachShader(shaderProgram, vertexShader)
  gl.attachShader(shaderProgram, fragmentShader)
  gl.linkProgram(shaderProgram)
  
  if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
    console.error('Unable to initialize the shader program:', gl.getProgramInfoLog(shaderProgram))
    return null
  }
  
  return shaderProgram
}

/**
 * 创建完整的着色器程序
 */
export function createProgram(gl: WebGLRenderingContext): WebGLProgram | null {
  const vertexShader = createShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER_SOURCE)
  const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER_SOURCE)
  
  if (!vertexShader || !fragmentShader) {
    return null
  }
  
  const program = createShaderProgram(gl, vertexShader, fragmentShader)
  
  // 清理着色器对象
  gl.deleteShader(vertexShader)
  gl.deleteShader(fragmentShader)
  
  return program
}
