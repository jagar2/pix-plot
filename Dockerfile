# Use an official Anaconda image as a parent image
FROM continuumio/miniconda3

# Set the working directory in the container
WORKDIR /usr/src/app

# Copy the current directory contents into the container at /usr/src/app
COPY . .

# Create a conda environment named "engr131" and install packages from requirements.txt
RUN conda create -n engr131 python=3.10
RUN echo "source activate pix" > ~/.bashrc
ENV PATH /opt/conda/envs/pix/bin:$PATH
RUN echo "source activate engr131" > ~/.bashrc && \
    /bin/bash -c "source activate engr131 && conda install nbconvert"

RUN pip install --no-cache-dir -r requirements.txt
# RUN echo -c "source activate engr131 && pip install --no-cache-dir -r requirements.txt"


# Install nbconvert and its dependencies
# RUN /bin/bash -c "source activate pix"

RUN conda install nbconvert

# Make port 80 available to the world outside this container
EXPOSE 80

#RUN rm Dockerfile requirements.txt docker_python_cookbook.md

# Start with a bash shell
CMD ["/bin/bash"]

