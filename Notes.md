## setup

Create a conda environment with python 3.10

`conda create -n pixplot python=3.10`

## Install pixplot

`conda install cudatoolkit=11`
`conda install -c anaconda cudnn`

This will install in editable mode, so you can make changes to the code and they will be reflected in the installed package.
`pip install -e .`

# Start pixplot
pixplot --images /home/ferroelectric/pix-plot/data/*/*.bmp --cell_size 10

# for python 3.x
# open the port
python -m http.server 7890
