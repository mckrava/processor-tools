test-store:
	@npx mocha -r dotenv/config lib/store-with-cache/test/**/*.test.js --exit --timeout 5000


up:
	@docker-compose up -d 2>&1


down:
	@docker-compose down -v 2>&1


.PHONY: test-store up down
