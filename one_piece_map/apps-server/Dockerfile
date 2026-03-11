# Utilise une version légère de Node.js
FROM node:20-alpine

# Définit le dossier de travail à l'intérieur du conteneur
WORKDIR /usr/src/app

# Copie d'abord le package.json (optimisation du cache Docker)
COPY package*.json ./

# Installe les dépendances
RUN npm install

# Copie tout le reste de ton code (le dossier src, tsconfig, etc.)
COPY . .

# Indique que le conteneur écoutera sur le port 4000
EXPOSE 4000

# La commande pour lancer ton script de dev (nodemon + ts-node)
CMD ["npm", "run", "dev"]