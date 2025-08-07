# Use an official Node.js runtime as a parent image
FROM node:18-alpine

# Set the working directory inside a container
WORKDIR /app

#Copy packaje.json nd package-lock.json first for better caching
COPY package*.json ./

# Intsall application dependencies 
RUN npm Intsall

# Copy the rest of your application code into container
COPY . .

# Expose the port your app runs on
EXPOSE 3000

# The command to run the application when the container starts
CMD [ "npm", "start"]
