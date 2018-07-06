PACKAGE_NAME = pubsjs

# Tools

YARN   ?= yarn

# Variables
TARGET  ?= ES5
DATE    ?= $(shell date -u +"%Y-%m-%dT%H:%M:%SZ")
VERSION ?= $(shell git describe --tags --always --dirty --match=v* 2>/dev/null | sed 's/^v//' || \
			cat $(CURDIR)/.version 2> /dev/null || echo 0.0.0-unreleased)

# Build

.PHONY: all
all: vendor | pubs docs

.PHONY: pubs
pubs: vendor ; $(info building $@ ...) @
	BUILD_VERSION=$(VERSION) BUILD_DATE=$(DATE) TARGET=$(TARGET) $(YARN) webpack --display-error-details --color --mode=production
	echo $(VERSION) > .version

.PHONY: pubs-es5
pubs-es5: TARGET=ES5
pubs-es5: pubs

.PHONY: pubs-es6
pubs-es5: TARGET=ES2015
pubs-es5: pubs

.PHONY: pubs-dev
pubs-dev: vendor ; $(info building and watching $@ ...) @
	@BUILD_VERSION=$(VERSION) BUILD_DATE=$(DATE) TARGET=$(TARGET) $(YARN) webpack --display-error-details --progress --color --mode=development --watch

.PHONY: docs
docs: vendor ; $(info building $@ ...) @
	@$(YARN) typedoc -- --out ./docs --hideGenerator --excludePrivate --readme ./doc/USAGE.md --name 'Kopano Pubs Javascript Client Library $(VERSION)' --mode file --theme minimal --target ES5 ./src

# Helpers

.PHONY: lint
lint: vendor ; $(info running linters ...) @
	@$(YARN) tslint -p .

# Yarn

.PHONY: vendor
vendor: .yarninstall

.yarninstall: package.json ; $(info getting depdencies with yarn ...)   @
	@$(YARN) install
	@touch $@

.PHONY: dist
dist: ; $(info building dist tarball ...)
	@mkdir -p "dist/"
	$(YARN) pack --filename="dist/${PACKAGE_NAME}-${VERSION}.tgz"

.PHONY: clean
clean: ; $(info cleaning ...) @
	$(YARN) cache clean
	@rm -rf umd
	@rm -f NOTICES.txt
	@rm -f .version
	@rm -rf node_modules
	@rm -f .yarninstall

.PHONY: version
version:
	@echo $(VERSION)
