PYTHON ?= python3
VENV ?= .venv
PIP := $(VENV)/bin/pip
PYTEST := $(VENV)/bin/pytest
UVICORN := $(VENV)/bin/uvicorn

.PHONY: setup backend-install frontend-install run run-backend run-frontend test clean

setup: backend-install frontend-install

backend-install:
	$(PYTHON) -m venv $(VENV)
	$(PIP) install --upgrade pip
	$(PIP) install -r backend/requirements.txt

frontend-install:
	cd frontend && npm install

run:
	@echo "Run backend and frontend in separate terminals:"
	@echo "make run-backend"
	@echo "make run-frontend"

run-backend:
	cd backend && ../$(UVICORN) app.main:app --reload --host 0.0.0.0 --port 8000

run-frontend:
	cd frontend && npm run dev

test:
	cd backend && ../$(PYTEST)

clean:
	rm -rf $(VENV) frontend/node_modules frontend/.next
	rm -f backend/jobs.db

