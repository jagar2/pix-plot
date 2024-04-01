# Use the official Miniconda image as a parent image
FROM continuumio/miniconda3

# Set the working directory in the container
WORKDIR /usr/src/app

# Copy the current directory contents into the container at /usr/src/app
COPY . /usr/src/app

# Copy your environment file into the container
COPY environment.yml /usr/src/app/environment.yml

# Create the Conda environment
RUN conda update -n base -c defaults conda && \
    conda env create -f environment.yml

# Make the startup script executable
RUN chmod +x /usr/src/app/startup.sh

# Use the startup script as the entry point
ENTRYPOINT ["/usr/src/app/startup.sh"]



