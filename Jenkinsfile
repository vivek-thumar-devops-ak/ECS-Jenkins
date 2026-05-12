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
                            env.TARGET_ENV  = 'dev'
                            env.ECR_REPO    = env.ECR_DEV_REPO
                            env.ECS_SERVICE = env.ECS_DEV_SERVICE
                        } 
                        else if (env.BRANCH_NAME == 'production') {
                            env.TARGET_ENV  = 'prod'
                            env.ECR_REPO    = env.ECR_PROD_REPO
                            env.ECS_SERVICE = env.ECS_PROD_SERVICE
                        }
                    }
                }
            }
        }

        stage('Build & Push Image') {
            when {
                anyOf {
                    branch 'develop'
                    branch 'production'
                }
            }

            steps {
                withCredentials([string(credentialsId: 'jenkins-oidc-token', variable: 'OIDC_TOKEN')]) {
                    script {

                        def creds = sh(
                            script: """
                                aws sts assume-role-with-web-identity \
                                --role-arn ${env.ROLE_ARN} \
                                --role-session-name jenkins-build \
                                --web-identity-token "${OIDC_TOKEN}" \
                                --query "Credentials.[AccessKeyId,SecretAccessKey,SessionToken]" \
                                --output text
                            """,
                            returnStdout: true
                        ).trim().split('\t')

                        withEnv([
                            "AWS_ACCESS_KEY_ID=${creds[0]}",
                            "AWS_SECRET_ACCESS_KEY=${creds[1]}",
                            "AWS_SESSION_TOKEN=${creds[2]}"
                        ]) {

                            def registry = "${env.AWS_ACCOUNT_ID}.dkr.ecr.${env.AWS_REGION}.amazonaws.com"
                            def imageTag = "${env.BRANCH_NAME}-${env.BUILD_NUMBER}"
                            def imageUri = "${registry}/${env.ECR_REPO}:${imageTag}"

                            sh """
                                aws ecr get-login-password --region ${env.AWS_REGION} \
                                | docker login --username AWS --password-stdin ${registry}

                                docker build -t ${imageUri} .
                                docker push ${imageUri}
                            """

                            env.IMAGE_URI = imageUri
                        }
                    }
                }
            }
        }

        stage('Deploy to ECS') {
            when {
                anyOf {
                    branch 'develop'

                    branch 'production'

                    allOf {
                        branch 'production'
                        expression {
                            def parents = sh(
                                script: "git log -1 --pretty=%P",
                                returnStdout: true
                            ).trim().split(" ")

                            return parents.size() > 1
                        }
                    }
                }
            }

            steps {
                withCredentials([string(credentialsId: 'jenkins-oidc-token', variable: 'OIDC_TOKEN')]) {
                    script {

                        def creds = sh(
                            script: """
                                aws sts assume-role-with-web-identity \
                                --role-arn ${env.ROLE_ARN} \
                                --role-session-name jenkins-deploy \
                                --web-identity-token "${OIDC_TOKEN}" \
                                --query "Credentials.[AccessKeyId,SecretAccessKey,SessionToken]" \
                                --output text
                            """,
                            returnStdout: true
                        ).trim().split('\t')

                        withEnv([
                            "AWS_ACCESS_KEY_ID=${creds[0]}",
                            "AWS_SECRET_ACCESS_KEY=${creds[1]}",
                            "AWS_SESSION_TOKEN=${creds[2]}"
                        ]) {

                            sh """
                                set -e

                                echo "Getting current task definition..."
                                TASK_DEF=\$(aws ecs describe-services \
                                    --cluster ${env.ECS_CLUSTER} \
                                    --services ${env.ECS_SERVICE} \
                                    --query "services[0].taskDefinition" \
                                    --output text)

                                echo "Fetching task definition JSON..."
                                aws ecs describe-task-definition \
                                    --task-definition \$TASK_DEF \
                                    --query "taskDefinition" > task-def.json

                                echo "Updating container image..."
                                jq --arg IMAGE "${env.IMAGE_URI}" '
                                    .containerDefinitions[0].image = \$IMAGE
                                    | del(
                                        .taskDefinitionArn,
                                        .revision,
                                        .status,
                                        .requiresAttributes,
                                        .compatibilities,
                                        .registeredAt,
                                        .registeredBy
                                        )
                                    ' task-def.json > new-task-def.json

                                echo "Registering new task definition..."
                                NEW_TASK_DEF=\$(aws ecs register-task-definition \
                                    --cli-input-json file://new-task-def.json \
                                    --query "taskDefinition.taskDefinitionArn" \
                                    --output text)

                                echo "Updating ECS service..."
                                aws ecs update-service \
                                    --cluster ${env.ECS_CLUSTER} \
                                    --service ${env.ECS_SERVICE} \
                                    --task-definition \$NEW_TASK_DEF \
                                    --region ${env.AWS_REGION}
                            """
                        }
                    }
                }
            }
        }
    }
}