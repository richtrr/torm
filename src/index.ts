const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

const TYPES = {
	Null: 1,
	Boolean: 2,
	Number: 3,
	Date: 4,

	Int8Array: 11,
	Int16Array: 12,
	Int32Array: 13,
	Uint8Array: 14,
	Uint16Array: 15,
	Uint32Array: 16,
	Float32Array: 17,
	Float64Array: 18,

	String: 21,
	Array: 22,
	Object: 23,
};

function typeIndexOf(value: any): number {
	if (value instanceof Function || value === null || value === undefined) {
		return TYPES.Null;
	} else if (value instanceof Int8Array) {
		return TYPES.Int8Array;
	} else if (value instanceof Int16Array) {
		return TYPES.Int16Array;
	} else if (value instanceof Int32Array) {
		return TYPES.Int32Array;
	} else if (value instanceof Uint8Array) {
		return TYPES.Uint8Array;
	} else if (value instanceof Uint16Array) {
		return TYPES.Uint16Array;
	} else if (value instanceof Uint32Array) {
		return TYPES.Uint32Array;
	} else if (value instanceof Float32Array) {
		return TYPES.Float32Array;
	} else if (value instanceof Float64Array) {
		return TYPES.Float64Array;
	} else if (value instanceof Array) {
		return TYPES.Array;
	} else if (value instanceof Date) {
		return TYPES.Date;
	} else if (typeof value === 'number') {
		return TYPES.Number;
	} else if (typeof value === 'boolean') {
		return TYPES.Boolean;
	} else if (typeof value === 'object') {
		return TYPES.Object;
	} else if (typeof value === 'string') {
		return TYPES.String;
	}

	return TYPES.Null;
}

type ReadChunk = {
	typeIndex: number;
	value: any;
	length: number;
	offset: number;
};

function readChunk(buffer: ArrayBuffer, offset: number): ReadChunk {
	let dataView = new DataView(buffer);
	let typeIndex = dataView.getUint8(offset);
	offset++;
	let length = 0;

	let value: any = null;
	if (typeIndex >= TYPES.Int8Array) {
		length = dataView.getUint32(offset);
		offset += 4;
		if (typeIndex <= TYPES.String) {
			let sub: ArrayBuffer = buffer.slice(offset, offset + length);
			offset += length;
			switch (typeIndex) {
				case TYPES.Int8Array:
					value = new Int8Array(sub);
					break;
				case TYPES.Int16Array:
					value = new Int16Array(sub);
					break;
				case TYPES.Int32Array:
					value = new Int32Array(sub);
					break;
				case TYPES.Uint8Array:
					value = new Uint8Array(sub);
					break;
				case TYPES.Uint16Array:
					value = new Uint16Array(sub);
					break;
				case TYPES.Uint32Array:
					value = new Uint32Array(sub);
					break;
				case TYPES.Float32Array:
					value = new Float32Array(sub);
					break;
				case TYPES.Float64Array:
					value = new Float64Array(sub);
					break;
				case TYPES.String:
					value = textDecoder.decode(sub);
					break;
			}
		}
	}

	switch (typeIndex) {
		case TYPES.Null:
			value = null;
			break;
		case TYPES.Boolean:
			value = dataView.getUint8(offset) != 0;
			offset++;
			break;

		case TYPES.Number:
			value = dataView.getFloat64(offset);
			offset += 8;
			break;

		case TYPES.Array:
			value = [];
			for (let i = 0; i < length; i++) {
				let item = readChunk(buffer, offset);
				offset = item.offset;
				value.push(item.value);
			}
			break;
		case TYPES.Object:
			value = {};
			for (let i = 0; i < length; i++) {
				const key = readChunk(buffer, offset);
				offset = key.offset;
				const val = readChunk(buffer, offset);
				offset = val.offset;
				value[key.value] = val.value;
			}
			break;
		case TYPES.Date:
			value = new Date(dataView.getFloat64(offset));
			offset += 8;
			break;
	}

	return {
		typeIndex: typeIndex,
		value: value,
		length: length,
		offset: offset,
	};
}

type CreateChunk = {
	byteLength: number;
	length: number;
	value: any;
	subBuffer: any | null;
	typeIndex: number;
};

function createChunk(value: any, typeIndex: number = 0): CreateChunk {
	if (!typeIndex) typeIndex = typeIndexOf(value);

	let length = 0;
	let byteLength = 0;
	let val;
	let subBuffer;

	switch (typeIndex) {
		case TYPES.Null:
			byteLength = 1;
			break;

		case TYPES.Boolean:
			byteLength = 1 + 1;
			break;

		case TYPES.Number:
			byteLength = 1 + 8;
			break;

		case TYPES.Int8Array:
		case TYPES.Int16Array:
		case TYPES.Int32Array:
		case TYPES.Uint8Array:
		case TYPES.Uint16Array:
		case TYPES.Uint32Array:
		case TYPES.Float32Array:
		case TYPES.Float64Array:
			length = value.byteLength;
			byteLength = 1 + 4 + length;
			break;

		case TYPES.String:
			subBuffer = textEncoder.encode(value);
			length = subBuffer.byteLength;
			byteLength = 1 + 4 + length;
			break;

		case TYPES.Array:
			length = value.length;
			val = [];
			byteLength = 1 + 4;
			for (let i = 0; i < value.length; i++) {
				let chunk = createChunk(value[i]);
				byteLength += chunk.byteLength;
				val.push(chunk);
			}
			value = val;
			break;

		case TYPES.Object:
			val = [];
			byteLength = 1 + 4;
			for (let s in value) {
				if (value.hasOwnProperty(s)) {
					length++;
					let chunk = createChunk(s, TYPES.String);
					byteLength += chunk.byteLength;
					val.push(chunk);
					chunk = createChunk(value[s]);
					byteLength += chunk.byteLength;
					val.push(chunk);
				}
			}
			value = val;
			break;

		case TYPES.Date:
			byteLength = 1 + 8;
			break;
	}

	return {
		byteLength: byteLength,
		length: length,
		value: value,
		subBuffer: subBuffer,
		typeIndex: typeIndex,
	};
}

function writeChunk(
	chunk: CreateChunk,
	buffer: ArrayBuffer,
	offset: number
): number {
	let dataView = new DataView(buffer);
	dataView.setUint8(offset, chunk.typeIndex);
	offset++;

	let value = chunk.value;
	let length: number = chunk.length;

	switch (chunk.typeIndex) {
		case TYPES.Null:
			break;
		case TYPES.Boolean:
			dataView.setUint8(offset, value ? 0xff : 0x00);
			offset++;
			break;
		case TYPES.Number:
			dataView.setFloat64(offset, value);
			offset += 8;
			break;

		case TYPES.Int8Array:
		case TYPES.Int16Array:
		case TYPES.Int32Array:
		case TYPES.Uint8Array:
		case TYPES.Uint16Array:
		case TYPES.Uint32Array:
		case TYPES.Float32Array:
		case TYPES.Float64Array:
			dataView.setUint32(offset, length);
			offset += 4;
			new Uint8Array(buffer).set(new Uint8Array(value.buffer), offset);
			offset += length;
			break;

		case TYPES.String:
			dataView.setUint32(offset, length);
			offset += 4;
			new Uint8Array(buffer).set(new Uint8Array(chunk.subBuffer), offset);
			offset += length;
			break;

		case TYPES.Array:
		case TYPES.Object:
			dataView.setUint32(offset, length);
			offset += 4;
			for (let i = 0; i < value.length; i++)
				offset = writeChunk(value[i], buffer, offset);
			break;
		case TYPES.Date:
			dataView.setFloat64(offset, value.getTime());
			offset += 8;
			break;
	}
	return offset;
}

function serialize(value: any): ArrayBuffer {
	let chunk = createChunk(value, 0);
	let buffer = new ArrayBuffer(chunk.byteLength);
	writeChunk(chunk, buffer, 0);
	return buffer;
}

function deserialize(buffer: ArrayBuffer): any {
	let chunk = readChunk(buffer, 0);
	return chunk.value;
}

export const TORM = { serialize, deserialize };
