"""Apply limits in a fresh process, never preexec_fn in the HTTP server threads."""
import os
import resource
import sys

if len(sys.argv) < 2 or sys.argv[1] not in {'tesseract', 'pdfinfo', 'pdftotext', 'pdftoppm'}:
    sys.exit(2)
resource.setrlimit(resource.RLIMIT_AS, (768 * 1024 * 1024, 768 * 1024 * 1024))
resource.setrlimit(resource.RLIMIT_CPU, (40, 40))
resource.setrlimit(resource.RLIMIT_FSIZE, (32 * 1024 * 1024, 32 * 1024 * 1024))
resource.setrlimit(resource.RLIMIT_NOFILE, (64, 64))
os.execvp(sys.argv[1], sys.argv[1:])
