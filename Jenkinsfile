pipeline {
    agent any

    stages {
        stage('Initialize') {
            steps {
                withCredentials([
                    string(credentialsId: 'aws-account-id', variable: 'TEMP_ACCOUNT_ID'),
                    string(credentialsId: 'aws-role-arn', variable: 'TEMP_ROLE_ARN')
                ]) { 
                    script {
                        env.AWS_ACCOUNT_ID = TEMP_ACCOUNT_ID
                        env.ROLE_ARN       = TEMP_ROLE_ARN
                        
                        if (env.BRANCH_NAME == 'develop') {
                            env.TARGET_ENV = 'dev'
                            env.ECR_REPO   = env.ECR_DEV_REPO
                            env.ECS_SERVICE = env.ECR_DEV_SERVICE
                        } else if (env.BRANCH_NAME == 'production') {
                            env.TARGET_ENV = 'prod'
                            env.ECR_REPO   = env.ECR_PROD_REPO
                            env.ECS_SERVICE = env.ECR_PROD_SERVICE
                        }
                    }
                }
            }
        }

        stage('Build & Push') {
            when { expression { env.BRANCH_NAME == 'develop' || env.BRANCH_NAME == 'production' } }
            steps {
                withCredentials([string(credentialsId: 'jenkins-oidc-token', variable: 'OIDC_TOKEN')]) {
                    script {
                        
                        def assumeRole = sh(
                            script: """
                                aws sts assume-role-with-web-identity \
                                --role-arn ${env.ROLE_ARN} \
                                --role-session-name jenkins-session \
                                --web-identity-token "${OIDC_TOKEN}" \
                                --query "Credentials.[AccessKeyId,SecretAccessKey,SessionToken]" \
                                --output text
                            """,
                            returnStdout: true
                        ).trim().split('\t')

                        withEnv([
                            "AWS_ACCESS_KEY_ID=${assumeRole[0]}",
                            "AWS_SECRET_ACCESS_KEY=${assumeRole[1]}",
                            "AWS_SESSION_TOKEN=${assumeRole[2]}"
                        ]) {
                            def registry = "${env.AWS_ACCOUNT_ID}.dkr.ecr.${env.AWS_REGION}.amazonaws.com"
                            def imageTag = "${env.BRANCH_NAME}-${env.BUILD_NUMBER}"
                            def repoName = env.ECR_REPO

                            sh """
                                aws ecr get-login-password --region ${env.AWS_REGION} | docker login --username AWS --password-stdin ${registry}
                                docker build -t ${registry}/${repoName}:${imageTag} .
                                docker tag ${registry}/${repoName}:${imageTag} ${registry}/${repoName}:latest
                                docker push ${registry}/${repoName}:${imageTag}
                                docker push ${registry}/${repoName}:latest
                            """
                            env.LATEST_TAG = imageTag
                        }
                    }
                }
            }
        }

        stage('Deploy to ECS') {
            when {
                anyOf {
                    branch 'develop'
                    
                    all {
                        branch 'production'
                        expression {
                            def commitMsg = sh(script: 'git log -1 --pretty=%B', returnStdout: true).toLowerCase()
                            return commitMsg.contains("merge pull request") && commitMsg.contains("from develop")
                        }
                    }
                }
            }
            steps {
                withCredentials([string(credentialsId: 'jenkins-oidc-token', variable: 'OIDC_TOKEN')]) {
                    script {
                        def assumeRole = sh(
                            script: "aws sts assume-role-with-web-identity --role-arn ${env.ROLE_ARN} --role-session-name jenkins-deploy --web-identity-token ${OIDC_TOKEN} --query 'Credentials.[AccessKeyId,SecretAccessKey,SessionToken]' --output text",
                            returnStdout: true
                        ).trim().split('\t')

                        withEnv([
                            "AWS_ACCESS_KEY_ID=${assumeRole[0]}",
                            "AWS_SECRET_ACCESS_KEY=${assumeRole[1]}",
                            "AWS_SESSION_TOKEN=${assumeRole[2]}"
                        ]) {
                            sh "aws ecs update-service --cluster ${env.ECS_CLUSTER} --service ${env.ECS_SERVICE} --force-new-deployment --region ${env.AWS_REGION}"
                        }
                    }
                }
            }
        }

    }
}
