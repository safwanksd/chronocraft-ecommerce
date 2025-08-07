# Use an official Node.js runtime as a parent image
FROM node:18-alpine

# Set the working directory inside a container
WORKDIR /app

#Copy packaje.json nd package-lock.json first for better caching
COPY package*.json ./
