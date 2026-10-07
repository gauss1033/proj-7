////////////////////////////////////////////
/////                                  /////
///// GOT CODEX TO DO PROJECT 5 FOR ME /////
/////                                  /////
////////////////////////////////////////////

// Matrices are column-major: rotate about X, then Y, then translate.
function GetModelViewMatrix(translationX, translationY, translationZ, rotationX, rotationY) {
    const cx = Math.cos(rotationX), sx = Math.sin(rotationX);
    const cy = Math.cos(rotationY), sy = Math.sin(rotationY);
    const rx = [1,0,0,0, 0,cx,sx,0, 0,-sx,cx,0, 0,0,0,1];
    const ry = [cy,0,-sy,0, 0,1,0,0, sy,0,cy,0, 0,0,0,1];
    const t = [1,0,0,0, 0,1,0,0, 0,0,1,0, translationX,translationY,translationZ,1];
    return MatrixMult(t, MatrixMult(ry, rx));
}

class MeshDrawer {
    constructor() {
        this.prog = InitShaderProgram(`
            attribute vec3 position;
            attribute vec2 texCoord;
            attribute vec3 normal;
            uniform mat4 mvp;
            uniform mat4 mv;
            uniform mat3 normalMatrix;
            uniform bool swapAxes;
            varying vec2 uv;
            varying vec3 cameraPosition;
            varying vec3 cameraNormal;
            void main() {
                vec3 p = swapAxes ? position.xzy : position;
                vec3 n = swapAxes ? normal.xzy : normal;
                gl_Position = mvp * vec4(p, 1.0);
                cameraPosition = (mv * vec4(p, 1.0)).xyz;
                cameraNormal = normalMatrix * n;
                uv = texCoord;
            }
        `, `
            precision mediump float;
            uniform sampler2D meshTexture;
            uniform bool useTexture;
            uniform vec3 lightDir;
            uniform float shininess;
            varying vec2 uv;
            varying vec3 cameraPosition;
            varying vec3 cameraNormal;
            void main() {
                vec3 n = normalize(cameraNormal);
                vec3 l = normalize(lightDir);
                vec3 v = normalize(-cameraPosition);
                vec3 h = (l + v) / max(length(l + v), 0.0001);
                float diffuse = max(dot(n, l), 0.0);
                float specular = diffuse > 0.0
                    ? pow(max(dot(n, h), 0.0), shininess) : 0.0;
                vec3 kd = useTexture ? texture2D(meshTexture, uv).rgb : vec3(1.0);
                // Small optional ambient term keeps unlit surfaces visible.
                gl_FragColor = vec4(kd * (0.08 + diffuse) + vec3(specular), 1.0);
            }
        `);
        this.attributes = {};
        for (const name of ['position', 'texCoord', 'normal']) {
            this.attributes[name] = gl.getAttribLocation(this.prog, name);
        }
        this.uniforms = {};
        for (const name of ['mvp', 'mv', 'normalMatrix', 'swapAxes', 'meshTexture',
                            'useTexture', 'lightDir', 'shininess']) {
            this.uniforms[name] = gl.getUniformLocation(this.prog, name);
        }
        this.positionBuffer = gl.createBuffer();
        this.texCoordBuffer = gl.createBuffer();
        this.normalBuffer = gl.createBuffer();
        this.texture = gl.createTexture();
        this.numVertices = 0;
        this.hasTexture = false;
        this.hasTexCoords = false;
        this.textureVisible = true;

        // A complete white texture is needed even before an image is loaded.
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA,
                      gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.useProgram(this.prog);
        gl.uniform1i(this.uniforms.meshTexture, 0);
        this.swapYZ(false);
        this.setLightDir(0, 0, -1);
        this.setShininess(100);
    }

    setMesh(vertPos, texCoords, normals) {
        this.numVertices = vertPos.length / 3;
        this.hasTexCoords = !!texCoords && texCoords.length === this.numVertices * 2;
        const uv = this.hasTexCoords ? texCoords : new Float32Array(this.numVertices * 2);
        // OBJ files without normals still render using per-triangle normals.
        if (!normals || normals.length !== vertPos.length) {
            normals = new Float32Array(vertPos.length);
            for (let i = 0; i < vertPos.length; i += 9) {
                const ax = vertPos[i+3] - vertPos[i], ay = vertPos[i+4] - vertPos[i+1];
                const az = vertPos[i+5] - vertPos[i+2];
                const bx = vertPos[i+6] - vertPos[i], by = vertPos[i+7] - vertPos[i+1];
                const bz = vertPos[i+8] - vertPos[i+2];
                const nx = ay*bz-az*by, ny = az*bx-ax*bz, nz = ax*by-ay*bx;
                const length = Math.hypot(nx, ny, nz) || 1;
                for (let j = 0; j < 9; j += 3) {
                    normals[i+j] = nx/length;
                    normals[i+j+1] = ny/length;
                    normals[i+j+2] = nz/length;
                }
            }
        }
        for (const [buffer, data] of [[this.positionBuffer, vertPos],
                [this.texCoordBuffer, uv], [this.normalBuffer, normals]]) {
            gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.DYNAMIC_DRAW);
        }
    }

    swapYZ(swap) {
        gl.useProgram(this.prog);
        gl.uniform1i(this.uniforms.swapAxes, swap ? 1 : 0);
    }

    draw(matrixMVP, matrixMV, matrixNormal) {
        if (!this.numVertices) return;
        gl.useProgram(this.prog);
        gl.uniformMatrix4fv(this.uniforms.mvp, false, matrixMVP);
        gl.uniformMatrix4fv(this.uniforms.mv, false, matrixMV);
        gl.uniformMatrix3fv(this.uniforms.normalMatrix, false, matrixNormal);
        gl.uniform1i(this.uniforms.useTexture,
            this.textureVisible && this.hasTexture && this.hasTexCoords ? 1 : 0);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        for (const [name, buffer, size] of [
            ['position', this.positionBuffer, 3],
            ['texCoord', this.texCoordBuffer, 2],
            ['normal', this.normalBuffer, 3]]) {
            gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
            gl.vertexAttribPointer(this.attributes[name], size, gl.FLOAT, false, 0, 0);
            gl.enableVertexAttribArray(this.attributes[name]);
        }
        gl.drawArrays(gl.TRIANGLES, 0, this.numVertices);
        // The box/point drawers share this context and use different buffers.
        for (const location of Object.values(this.attributes)) gl.disableVertexAttribArray(location);
    }

    setTexture(img) {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        const wasFlipped = gl.getParameter(gl.UNPACK_FLIP_Y_WEBGL);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, wasFlipped);
        // Linear filtering and clamp-to-edge also support non-power-of-two images.
        this.hasTexture = true;
    }

    showTexture(show) { this.textureVisible = show; }

    setLightDir(x, y, z) {
        gl.useProgram(this.prog);
        gl.uniform3f(this.uniforms.lightDir, x, y, z);
    }

    setShininess(shininess) {
        gl.useProgram(this.prog);
        gl.uniform1f(this.uniforms.shininess, shininess);
    }
}


//////////////////////////////////////////////////
/////                                        /////
///// PROJECT 7 CODE BELOW WAS WRITTEN BY ME /////
/////                                        /////
//////////////////////////////////////////////////


// This function is called for every step of the simulation.
// Its job is to advance the simulation for the given time step duration dt.
// It updates the given positions and velocities.
function SimTimeStep( dt, positions, velocities, springs, stiffness, damping, particleMass, gravity, restitution )
{
	var forces = Array(positions.length); // The total for per particle
	let n = positions.length
	for (var k = 0; k < springs.length; i++){
		let i = springs[k].p0
		let j = springs[k].p1
		let disp = positions[i].sub(positions[j]) / positions[i].sub(positions[j]).len()
		let forceS = disp.scale(stiffness * (positions[i].sub(positions[j]).len() - springs[k].rest))
		let forceD = disp.scale(damping * (velocities[i].sub(velocities[j])).dot(disp))
		forces[i] = forces[i].sub(forceS + forceD)
		forces[j] = forces[j].add(forceS + forceD)
	}
	for (var i = 0; i < n; i++){
		forces[i].z -= gravity * particleMass
	}

	for (var i = 0; i < n; i++){
		velocities[i] = velocities[i].add(forces[i] / particleMass * dt)
	}

	for (var i = 0; i < n ; i++){
		positions[i] = positions[i].add(velocities[i] * dt)
		if (positions[i].x < -1){
			positions[i].x = -1 - restitution * (positions[i].x + 1)
		}
		if (positions[i].x > 1){
			positions[i].x = 1 - restitution * (positions[i].x - 1)
		}
		if (positions[i].y < -1){
			positions[i].y = -1 - restitution * (positions[i].y + 1)
		}
		if (positions[i].y > 1){
			positions[i].y = 1 - restitution * (positions[i].y - 1)
		}
		if (positions[i].z < -1){
			positions[i].z = -1 - restitution * (positions[i].z + 1)
		}
		if (positions[i].z > 1){
			positions[i].z = 1 - restitution * (positions[i].z - 1)
		}
	}
	return;
}

