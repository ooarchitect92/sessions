SHELL := /bin/bash

.PHONY: setup dev build test lint typecheck infra-up infra-down migrate seed reset

setup:
	npm install
	npm run db:generate

infra-up:
	docker compose up -d postgres redis minio livekit

infra-down:
	docker compose down

migrate:
	npm run db:migrate

seed:
	npm run db:seed

dev:
	npm run dev

build:
	npm run build

lint:
	npm run lint

typecheck:
	npm run typecheck

test:
	npm run test

reset:
	docker compose down -v
	docker compose up -d postgres redis minio livekit
	npm run db:migrate
	npm run db:seed
