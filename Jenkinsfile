pipeline {
    agent any

    stages {
        stage('Initialize') {
            steps {
                script {
                    if (env.BRANCH_NAME == 'develop') {
                        env.TARGET_ENV = 'dev'
                        env.ECR_REPO = env.ECR_DEV_REPO
                        env.ECS_SERVICE = env.ECS_DEV_SERVICE
                    } else if (env.BRANCH_NAME == 'production') {
                        env.TARGET_ENV = 'prod'
                        env.ECR_REPO = env.ECR_PROD_REPO
                        env.ECS_SERVICE = env.ECS_PROD_SERVICE
                    }
                }
            }
        }

        stage('Build & Push') {
            when { 
                expression { env.BRANCH_NAME == 'develop' || env.BRANCH_NAME == 'production' } 
            }
            steps {
                withCredentials([string(credentialsId: 'jenkins-oidc-token', variable: 'AWS_WEB_IDENTITY_TOKEN')]) {
                    withAWS(role: env.ROLE_ARN, region: env.AWS_REGION, roleSessionName: 'jenkins-session') {
                        script {
                            def registry = "${env.AWS_ACCOUNT_ID}.dkr.ecr.${env.AWS_REGION}.amazonaws.com"
                            def imageTag = "${env.BRANCH_NAME}-${env.BUILD_NUMBER}"
                            def repoName = env.ECR_REPO

                            // Docker login using the assumed role permissions
                            sh "aws ecr get-login-password --region ${env.AWS_REGION} | docker login --username AWS --password-stdin ${registry}"

                            sh "docker build -t ${registry}/${repoName}:${imageTag} ."
                            sh "docker tag ${registry}/${repoName}:${imageTag} ${registry}/${repoName}:latest"
                            sh "docker push ${registry}/${repoName}:${imageTag}"
                            sh "docker push ${registry}/${repoName}:latest"
                            
                            env.LATEST_TAG = imageTag
                        }
                    }
                }
            }
        }

        // stage('Deploy to ECS') {
        //     when {
        //         anyOf {
        //             branch 'develop'
        
        //             all {
        //                 branch 'production'
        //                 expression {
        //                     return env.CHANGE_SOURCE == 'develop' 
        //                 }
        //             }
        //         }
        //     }
        //     steps {
        //         withAWS(role: env.ROLE_ARN, region: env.AWS_REGION) {
        //             sh """
        //             aws ecs update-service \
        //             --cluster ${env.ECS_CLUSTER} \
        //             --service ${env.ECS_SERVICE} \
        //             --force-new-deployment
        //             """
        //         }
        //     }
        // }
    }
}