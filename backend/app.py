"""Plot-Ark backend entry point — registers all Blueprints and initializes DB."""

import os
from extensions import app
from db import init_db

# Import and register all route Blueprints
from routes.curriculum import curriculum_bp
from routes.history import history_bp
from routes.sources import sources_bp
from routes.graph import graph_bp
from routes.xapi import xapi_bp, seed_mock_xapi
from routes.syllabus import syllabus_bp
from routes.materials import materials_bp
from routes.feedback import feedback_bp
from routes.analytics import analytics_bp
from routes.settings import settings_bp

app.register_blueprint(curriculum_bp)
app.register_blueprint(history_bp)
app.register_blueprint(sources_bp)
app.register_blueprint(graph_bp)
app.register_blueprint(xapi_bp)
app.register_blueprint(syllabus_bp)
app.register_blueprint(materials_bp)
app.register_blueprint(feedback_bp)
app.register_blueprint(analytics_bp)
app.register_blueprint(settings_bp)

# Initialize database and seed mock data
init_db()
seed_mock_xapi()

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=True)
