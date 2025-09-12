FROM node:18-alpine
WORKDIR /app

# Copy package.json and modify dependencies
COPY package.json ./
RUN npm pkg set dependencies.winston="^3.13.0"
RUN npm pkg delete dependencies.@swifttrack/logger || true
RUN npm install

# Copy service files
COPY . ./

EXPOSE 5002
CMD ["npm", "start"]
