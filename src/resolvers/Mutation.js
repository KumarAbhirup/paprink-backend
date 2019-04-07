const jwt = require('jsonwebtoken')
const slugify = require('slug')
const { isTokenValid } = require('../utils')
const { postInfo } = require('../utils')

async function signIn(parent, args, context, info){

  const data = { ...args }

  // Verify token
  const isValid = await isTokenValid(args.signUpMethod, args.accessToken)
  if(!isValid) {
    throw new Error("Failed to recognize you!")
  }

  // Check if user is already signedUp!
  const signedUser = await context.db.query.user({where: {socialId: data.socialId}}, info)
  if(!signedUser) {

    // Create user
    const newUser = await context.db.mutation.createUser({
      data: {
        ...data,
        username: `${slugify(args.name, { lower: true, replacement: '_' })}_${Math.floor(Math.random() * 99) + 1}`
      }
    }, info)

    const token = jwt.sign({ userId: newUser.id, /*accessToken: args.accessToken,*/ signUpMethod: args.signUpMethod }, process.env.JWT_SECRET)
    context.response.cookie('paprinkToken', token, {
        httpOnly: true,
        maxAge: 1000 * 60 * 60 * 24 * 7
    })

    return newUser

  }

  // Update user with new access token
  await context.db.mutation.updateUser({
    data: {
      accessToken: data.accessToken,
      fname: data.fname,
      lname: data.lname,
      name: data.name,
      profilePicture: data.profilePicture,
      email: data.email, // TODO: Handle email match conflicts if email got changed
      gender: data.gender,
      birthday: data.birthday,
      bio: data.bio
    },
    where: { id: signedUser.id }
  }, info)

  const token = jwt.sign({ userId: signedUser.id, /*accessToken: args.accessToken,*/ signUpMethod: args.signUpMethod }, process.env.JWT_SECRET)
  await context.response.cookie('paprinkToken', token, {
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24 * 7
  })

  return signedUser

}

async function signOut(parent, args, context, info){

  /**
   * Revoke Google Token: https://accounts.google.com/o/oauth2/revoke?token={access_token}
   * Revoke FB token: https://developers.facebook.com/docs/facebook-login/permissions/v2.0 [DELETE /{user-id}/permissions?access_token={access_token}]
   */

  await context.response.clearCookie('paprinkToken')
  return { code: 10, message: 'Signed out successfully.' }

}

async function savePost(parent, args, context, info){
  
  let data = {...args}
  delete data.categories
  delete data.status

  if (!context.request.userId) {
    throw new Error('Please SignIn to continue.')
  }

  const post = await context.db.mutation.createPost({
    data: {
      author: { connect: { id: context.request.userId } },
      authorId: context.request.userId,
      categories: {
        connect: args.categories.map(category => ({ category })),
      },
      status: args.status,
      slug: slugify(args.title, { lower: true }),
      ...data
    }
  }, info)

  return post

}

async function updatePost(parent, args, context, info){

  if (!context.request.userId) {
    throw new Error('Please SignIn to continue.')
  }

  const postToUpdate = await context.db.query.post({where: {id: args.id}}, postInfo)
  const canUpdate = postToUpdate.author.id === context.request.userId

  if (canUpdate) {

    // 1. First, disconnect the categories you had earlier
    await context.db.mutation.updatePost({
      where: { id: postToUpdate.id },
      data: {
        categories: {
          disconnect: JSON.parse(JSON.stringify(postToUpdate)).categories.map(category => {
            return { category: category.category }
          })
        }
      }
    }, `{ id }`)

    // 2. Fill the post with new categories!
    const post = await context.db.mutation.updatePost({
      where: { id: postToUpdate.id },
      data: {
        title: args.title,
        editorCurrentContent: args.editorCurrentContent,
        editorHtml: args.editorHtml,
        editorSerializedOutput: args.editorSerializedOutput,
        categories: {
          connect: args.categories.map(category => ({ category })),
        },
        thumbnail: args.thumbnail,
        status: args.status,
        slug: slugify(args.title, { lower: true }),
      }
    }, info)

    return post

  }

  throw new Error('You cannot update this post.')

}

async function upvote(parent, args, context, info){

  // Check if user is signed in.

  // UPVOTE!

}

module.exports = {
  signIn,
  signOut,
  savePost,
  updatePost
}
