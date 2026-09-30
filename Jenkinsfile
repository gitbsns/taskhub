// ============================================================
// TaskHub - CI Pipeline (Phase 3)
//
// Ye pipeline sirf itna karta hai: code -> test -> image build -> Docker Hub push.
// Kubernetes deploy Phase 5 mein add hoga, abhi is Jenkinsfile mein nahi hai.
//
// Zaroori Jenkins Credential (Step 2 mein bana):
//   dockerhub-creds  -> Username/Password (token)
// ============================================================

pipeline {
    agent any

    environment {
        DOCKERHUB_USER = 'ahbdoc'   // yahan apna username daalo
        IMAGE_NAME     = "${DOCKERHUB_USER}/taskhub-app"
        IMAGE_TAG      = "${BUILD_NUMBER}"            // har build ka apna unique tag
    }

    stages {

        stage('Checkout') {
            steps {
                // Jenkins job configuration mein diya GitHub URL se code khinchta hai
                echo 'Pulling latest code from GitHub...'
                checkout scm
            }
        }

        stage('Install Dependencies') {
            steps {
                // Sirf app/ folder ke dependencies chahiye, root mein package.json nahi
                dir('app') {
                    echo 'Installing npm dependencies...'
                    sh 'npm install'
                }
            }
        }

        stage('Build Docker Image') {
            steps {
                // Dockerfile app/ folder ke andar hai, isliye context wahi dena hoga
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

        stage('Cleanup') {
            steps {
                // Purani images hata kar disk space bachao
                echo 'Cleaning up dangling images...'
                sh 'docker image prune -f || true'
            }
        }
    }

    post {
        success {
            echo "Image ${IMAGE_NAME}:${IMAGE_TAG} successfully pushed to Docker Hub."
        }
        failure {
            echo 'Pipeline failed - check the stage above for the error.'
        }
        always {
            sh 'docker logout || true'
        }
    }
}

