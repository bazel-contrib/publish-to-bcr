#include <stdint.h>
#include <stdlib.h>

#include <lzma.h>

typedef uint32_t xzdec_lzma_ret;

struct Xzdec {
	lzma_stream stream;
};

__attribute__((export_name("xzdec_allocate")))
uint8_t *xzdec_allocate(uint32_t len) {
	return malloc(len);
}

__attribute__((export_name("xzdec_deallocate")))
void xzdec_deallocate(uint8_t *ptr) {
	free(ptr);
}

__attribute__((export_name("xzdec_new_stream_decoder")))
xzdec_lzma_ret xzdec_new_stream_decoder(
	uint32_t memlimit,
	uint32_t flags,
	struct Xzdec **xzdec_ptr
) {
	lzma_stream stream = LZMA_STREAM_INIT;
	lzma_ret rc = lzma_stream_decoder(&stream, memlimit, flags);
	if (rc != LZMA_OK) {
		return rc;
	}
	*xzdec_ptr = malloc(sizeof(struct Xzdec));
	(*xzdec_ptr)->stream = stream;
	return LZMA_OK;
}

__attribute__((export_name("xzdec_drop")))
void xzdec_drop(struct Xzdec *xzdec) {
	lzma_end(&(xzdec->stream));
	free(xzdec);
}

__attribute__((export_name("xzdec_input_empty")))
uint32_t xzdec_input_empty(struct Xzdec *xzdec) {
	if (xzdec->stream.avail_in == 0) {
		return 1;
	}
	return 0;
}

__attribute__((export_name("xzdec_set_input")))
void xzdec_set_input(
	struct Xzdec *xzdec,
	const uint8_t *input_buf,
	uint32_t input_buf_len
) {
	xzdec->stream.next_in = input_buf;
	xzdec->stream.avail_in = input_buf_len;
}

__attribute__((export_name("xzdec_next_output")))
xzdec_lzma_ret xzdec_next_output(
	struct Xzdec *xzdec,
	uint8_t *output_buf,
	uint32_t output_buf_cap,
	uint32_t *output_buf_len
) {
	xzdec->stream.next_out = output_buf;
	xzdec->stream.avail_out = output_buf_cap;
	lzma_ret rc = lzma_code(&(xzdec->stream), LZMA_RUN);
	*output_buf_len = output_buf_cap - xzdec->stream.avail_out;
	return rc;
}

__attribute__((export_name("xzdec_finish")))
xzdec_lzma_ret xzdec_finish(
	struct Xzdec *xzdec,
	uint8_t *output_buf,
	uint32_t output_buf_cap,
	uint32_t *output_buf_len
) {
	xzdec->stream.next_out = output_buf;
	xzdec->stream.avail_out = output_buf_cap;
	lzma_ret rc = lzma_code(&(xzdec->stream), LZMA_FINISH);
	*output_buf_len = output_buf_cap - xzdec->stream.avail_out;
	return rc;
}

// Prevent Clang from wrapping every inserted function and injecting calls
// to `__wasm_call_dtors()`.
void _initialize() {
	void __wasm_call_ctors();
	__wasm_call_ctors();
}
