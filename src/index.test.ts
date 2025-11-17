import { TORM } from './index';

describe('TORM', () => {
	test('serialize/deserialize roundtrip', () => {
		const original = {
			nil: null,
			integer: 1,
			float: Math.PI,
			string: 'Hello, world!',
			binary: Uint8Array.from([1, 2, 3]),
			float32: Float32Array.from([1.789, 2.555555, 2222222.111]),
			float64: Float64Array.from([1.2345, 2.789, 1111111111.111]),
			array: [10, 20, 30],
			map: { foo: 'bar' },
			timestampExt: new Date(),
		};

		const buffer = TORM.serialize(original);
		const deserialized = TORM.deserialize(buffer);
		expect(deserialized).toEqual(original);
	});
});
