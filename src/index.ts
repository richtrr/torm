const TYPES = {
	Null: 1,
	Boolean: 2,
	Number: 3,
	Date: 4,
	String: 5,
	Array: 6,
	Object: 7,

	Int8Array: 10,
	Int16Array: 11,
	Int32Array: 12,
	Uint8Array: 13,
	Uint16Array: 14,
	Uint32Array: 15,
	Float32Array: 16,
	Float64Array: 17,
} as const;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

type TypeCode = (typeof TYPES)[keyof typeof TYPES];

type SupportedTypedArray =
	| Int8Array
	| Int16Array
	| Int32Array
	| Uint8Array
	| Uint16Array
	| Uint32Array
	| Float32Array
	| Float64Array;

export type SupportedValue =
	| null
	| undefined
	| boolean
	| number
	| string
	| Date
	| SupportedTypedArray
	| Array<SupportedValue>
	| { [key: string]: SupportedValue };

const TYPED_ARRAY_TYPES: Record<
	number,
	new (buffer: ArrayBufferLike) => SupportedTypedArray
> = {
	[TYPES.Int8Array]: Int8Array,
	[TYPES.Int16Array]: Int16Array,
	[TYPES.Int32Array]: Int32Array,
	[TYPES.Uint8Array]: Uint8Array,
	[TYPES.Uint16Array]: Uint16Array,
	[TYPES.Uint32Array]: Uint32Array,
	[TYPES.Float32Array]: Float32Array,
	[TYPES.Float64Array]: Float64Array,
};

function getTypeCode(value: SupportedValue): TypeCode {
	if (value === null || value === undefined) return TYPES.Null;
	if (typeof value === 'boolean') return TYPES.Boolean;
	if (typeof value === 'number') return TYPES.Number;
	if (typeof value === 'string') return TYPES.String;
	if (value instanceof Date) return TYPES.Date;
	if (Array.isArray(value)) return TYPES.Array;
	if (value instanceof Int8Array) return TYPES.Int8Array;
	if (value instanceof Int16Array) return TYPES.Int16Array;
	if (value instanceof Int32Array) return TYPES.Int32Array;
	if (value instanceof Uint8Array) return TYPES.Uint8Array;
	if (value instanceof Uint16Array) return TYPES.Uint16Array;
	if (value instanceof Uint32Array) return TYPES.Uint32Array;
	if (value instanceof Float32Array) return TYPES.Float32Array;
	if (value instanceof Float64Array) return TYPES.Float64Array;
	if (typeof value === 'object') return TYPES.Object;

	return TYPES.Null;
}

// === READ ===

interface ReadResult {
	value: SupportedValue;
	offset: number;
}

function readChunk(buffer: ArrayBuffer, offset: number = 0): ReadResult {
	const view = new DataView(buffer);
	const type = view.getUint8(offset);
	offset += 1;

	if (type === TYPES.Null) {
		return { value: null, offset };
	}
	if (type === TYPES.Boolean) {
		return { value: view.getUint8(offset++) !== 0, offset };
	}
	if (type === TYPES.Number) {
		const value = view.getFloat64(offset);
		return { value, offset: offset + 8 };
	}
	if (type === TYPES.Date) {
		return { value: new Date(view.getFloat64(offset)), offset: offset + 8 };
	}

	const length = view.getUint32(offset);
	offset += 4;

	if (TYPED_ARRAY_TYPES[type] || type === TYPES.String) {
		const slice = buffer.slice(offset, offset + length);
		offset += length;

		if (type === TYPES.String) {
			return { value: decoder.decode(slice), offset };
		}

		const Ctor = TYPED_ARRAY_TYPES[type];
		return { value: new Ctor(slice), offset };
	}

	if (type === TYPES.Array) {
		const arr: SupportedValue[] = [];
		for (let i = 0; i < length; i++) {
			const result = readChunk(buffer, offset);
			offset = result.offset;
			arr.push(result.value);
		}
		return { value: arr, offset };
	}

	if (type === TYPES.Object) {
		const obj: Record<string, SupportedValue> = {};
		for (let i = 0; i < length; i++) {
			const keyResult = readChunk(buffer, offset);
			offset = keyResult.offset;
			const valResult = readChunk(buffer, offset);
			offset = valResult.offset;
			obj[keyResult.value as string] = valResult.value;
		}
		return { value: obj, offset };
	}

	throw new Error(`Unknown type code: ${type}`);
}

// === WRITE ===

interface Chunk {
	type: TypeCode;
	length: number;
	data?: Uint8Array | Array<Chunk>;
	value?: any;
}

function createChunk(value: SupportedValue): Chunk {
	const type = getTypeCode(value);

	if (type === TYPES.Null) return { type, length: 0 };
	if (type === TYPES.Boolean)
		return { type, length: 0, value: value ? 0xff : 0x00 };
	if (type === TYPES.Number) return { type, length: 0, value };
	if (type === TYPES.Date)
		return { type, length: 0, value: (value as Date).getTime() };

	if (type === TYPES.String) {
		const data = encoder.encode(value as string);
		return { type, length: data.byteLength, data };
	}

	if (TYPED_ARRAY_TYPES[type]) {
		const arr = value as SupportedTypedArray;
		return {
			type,
			length: arr.byteLength,
			data: new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength),
		};
	}

	if (type === TYPES.Array) {
		const items = (value as SupportedValue[]).map(createChunk);
		return { type, length: items.length, data: items };
	}

	if (type === TYPES.Object) {
		const entries: Chunk[] = [];
		for (const key in value as object) {
			if (Object.prototype.hasOwnProperty.call(value, key)) {
				entries.push(createChunk(key));
				entries.push(createChunk((value as any)[key]));
			}
		}
		return { type, length: entries.length / 2, data: entries };
	}

	throw new Error('Unsupported value');
}

function writeChunk(chunk: Chunk, buffer: ArrayBuffer, offset: number): number {
	const view = new DataView(buffer);
	const uint8 = new Uint8Array(buffer);

	view.setUint8(offset++, chunk.type);

	if (chunk.type === TYPES.Null) return offset;
	if (chunk.type === TYPES.Boolean) {
		view.setUint8(offset++, chunk.value as number);
		return offset;
	}
	if (chunk.type === TYPES.Number) {
		view.setFloat64(offset, chunk.value as number);
		return offset + 8;
	}
	if (chunk.type === TYPES.Date) {
		view.setFloat64(offset, chunk.value as number);
		return offset + 8;
	}

	// Длинные типы
	view.setUint32(offset, chunk.length);
	offset += 4;

	if (TYPED_ARRAY_TYPES[chunk.type] || chunk.type === TYPES.String) {
		uint8.set(chunk.data as Uint8Array, offset);
		return offset + chunk.length;
	}

	if (Array.isArray(chunk.data)) {
		for (const sub of chunk.data) {
			offset = writeChunk(sub, buffer, offset);
		}
	}

	return offset;
}

// === PUBLIC API ===

function calculateSize(chunk: Chunk): number {
	if (chunk.type === TYPES.Null) return 1;
	if (chunk.type === TYPES.Boolean) return 2;
	if (chunk.type === TYPES.Number || chunk.type === TYPES.Date) return 9;

	if (TYPED_ARRAY_TYPES[chunk.type] || chunk.type === TYPES.String) {
		return 1 + 4 + chunk.length;
	}

	if (chunk.type === TYPES.Array || chunk.type === TYPES.Object) {
		let size = 1 + 4;
		if (Array.isArray(chunk.data)) {
			for (const sub of chunk.data) {
				size += calculateSize(sub);
			}
		}
		return size;
	}

	return 0;
}

export const TORM = {
	serialize(value: SupportedValue): ArrayBuffer {
		const chunk = createChunk(value);
		const size = calculateSize(chunk);
		const buffer = new ArrayBuffer(size);
		writeChunk(chunk, buffer, 0);
		return buffer;
	},

	deserialize(buffer: ArrayBuffer): SupportedValue {
		if (buffer.byteLength === 0) throw new Error('Empty buffer');
		return readChunk(buffer).value;
	},
} as const;
