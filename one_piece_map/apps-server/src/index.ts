// apps-server/src/index.ts
console.log("🌊 Le Vogue Merry lève l'ancre sur le port 4000 !");

const startServer = () => {
    const port = process.env.PORT || 4000;
    // On ajoutera Express ou Fastify ici plus tard
    console.log(`Le Haki d'observation écoute sur le port ${port}...`);
};

startServer();