#!/usr/bin/env groovy

pipeline {
	agent {
		docker {
			image 'node:10'
			args '-u 0'
		}
	}
	environment {
		CI = 'true'
	}
	stages {
		stage('Lint') {
			steps {
				sh 'make lint-checkstyle'
				checkstyle pattern: 'test/tests.eslint.xml', canComputeNew: false, unstableTotalHigh: '0', thresholdLimit: 'high'
			}
		}
		stage('Build') {
			steps {
				sh 'make'
			}
		}
		stage('Dist') {
			when {
				branch 'master'
			}
			steps {
				sh 'make dist'
				archiveArtifacts artifacts: 'dist/*.tgz', fingerprint: true
			}
		}
	}
	post {
		always {
			cleanWs()
		}
	}
}
