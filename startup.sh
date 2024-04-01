#!/bin/bash
# startup.sh

# Run PixPlot command
pixplot --images ./data/*/*.bmp --cell_size 10

# Start a simple HTTP server
python -m http.server 5000
