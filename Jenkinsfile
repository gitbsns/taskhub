// ============================================================
// TaskHub - CI/CD Pipeline (Phase 3 + Phase 5)
//
// Build -> Push -> Deploy to Kubernetes, automatically.
//
// Jenkins Credentials zaroori hain:
//   dockerhub-creds      -> Username/Password (Docker Hub token)
//   kubeconfig-taskhub   -> Secret file (taskhub-kubeconfig.yaml)
// ============================================================

pipeline {
    agent any

    environment {
        DOCKERHUB_USER = 'ahbdoc'
        IMAGE_NAME     = "${DOCKERHUB_USER}/taskhub-app"
        IMAGE_TAG      = "${BUILD_NUMBER}"
        K8S_NAMESPACE  = 'taskhub'
        DEPLOYMENT     = 'taskhub-app'
        CONTAINER_NAME = 'taskhub-app'
    }

    stages {

        stage('Checkout') {
            steps {
                echo 'Pulling latest code from GitHub...'
                checkout scm
            }
        }

        stage('Install Dependencies') {
            steps {
                dir('app') {
                    echo 'Installing npm dependencies...'
                    sh 'npm install'
                }
            }
        }

        stage('Build Docker Image') {
            steps {
                echo "Building image: ${IMAGE_NAME}:${IMAGE_TAG}"
                sh "docker build -t ${IMAGE_NAME}:${IMAGE_TAG} -t ${IMAGE_NAME}:latest ./app"
            }
        }

        stage('Push to Docker Hub') {
            steps {
                echo 'Pushing image to Docker Hub...'
                withCredentials([usernamePassword(
                    credentialsId: 'dockerhub-creds',
                    usernameVariable: 'DOCKER_USER',
                    passwordVariable: 'DOCKER_PASS'
                )]) {
                    sh '''
                        echo "$DOCKER_PASS" | docker login -u "$DOCKER_USER" --password-stdin
                        docker push ${IMAGE_NAME}:${IMAGE_TAG}
                        docker push ${IMAGE_NAME}:latest
                    '''
                }
            }
        }

        stage('Deploy to Kubernetes') {
            steps {
                echo "Rolling update: ${DEPLOYMENT} -> ${IMAGE_NAME}:${IMAGE_TAG}"
                withKubeConfig([credentialsId: 'kubeconfig-taskhub']) {
                    sh '''
                        kubectl set image deployment/${DEPLOYMENT} \
                            ${CONTAINER_NAME}=${IMAGE_NAME}:${IMAGE_TAG} \
                            -n ${K8S_NAMESPACE}
                    '''
                }
            }
        }

        stage('Verify Rollout') {
            steps {
                echo 'Checking rollout status...'
                withKubeConfig([credentialsId: 'kubeconfig-taskhub']) {
                    sh "kubectl rollout status deployment/${DEPLOYMENT} -n ${K8S_NAMESPACE} --timeout=90s"
                }
            }
        }

        stage('Cleanup') {
            steps {
                echo 'Cleaning up dangling images...'
                sh 'docker image prune -f || true'
            }
        }
    }

    post {
        success {
            echo "Deployed ${IMAGE_NAME}:${IMAGE_TAG} to Kubernetes successfully."
        }
        failure {
            echo 'Pipeline failed. Kubernetes keeps previous working pods running if rollout failed (no downtime).'
        }
        always {
            sh 'docker logout || true'
        }
    }
}
